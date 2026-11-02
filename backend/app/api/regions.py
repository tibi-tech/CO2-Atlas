import io
import json
import zipfile

import shapefile  # pyshp
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from pyproj import CRS
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.validation import make_valid
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import require_password
from app.db.models import Region, Run, engine
from app.pipeline.grid import area_km2, geometry_from_geojson, to_crs

router = APIRouter(prefix="/api/regions", tags=["regions"])


class RegionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    geometry: dict
    population: int | None = Field(default=None, ge=0)
    emissions_per_capita: float | None = Field(default=None, ge=0)


class RegionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    population: int | None = Field(default=None, ge=0)
    emissions_per_capita: float | None = Field(default=None, ge=0)


def clean_geometry(geom: BaseGeometry) -> BaseGeometry:
    geom = make_valid(geom)
    polys = [g for g in getattr(geom, "geoms", [geom]) if g.geom_type in ("Polygon",
                                                                           "MultiPolygon")]
    if not polys:
        raise HTTPException(422, "geometry_not_polygon")
    geom = unary_union(polys)
    minx, miny, maxx, maxy = geom.bounds
    if not (-180 <= minx <= maxx <= 180 and -90 <= miny <= maxy <= 90):
        raise HTTPException(422, "geometry_not_wgs84")
    a = area_km2(geom)
    if a < 0.01:
        raise HTTPException(422, "geometry_too_small")
    if a > get_settings().max_region_km2:
        raise HTTPException(422, "geometry_too_large")
    return geom


def region_out(r: Region, db: Session) -> dict:
    runs = db.exec(select(Run).where(Run.region_id == r.id)).all()
    return {**r.model_dump(), "run_count": len(runs),
            "done_count": sum(1 for x in runs if x.status == "done")}


@router.get("")
def list_regions():
    with Session(engine) as db:
        return [region_out(r, db) for r in db.exec(select(Region).order_by(Region.id)).all()]


@router.get("/{region_id}")
def get_region(region_id: int):
    with Session(engine) as db:
        r = db.get(Region, region_id)
        if not r:
            raise HTTPException(404, "region_not_found")
        return region_out(r, db)


@router.post("", dependencies=[Depends(require_password)])
def create_region(body: RegionIn):
    try:
        geom = geometry_from_geojson(body.geometry)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, "geometry_invalid") from e
    geom = clean_geometry(geom)
    r = Region(name=body.name, geometry=mapping(geom), area_km2=area_km2(geom),
               population=body.population, emissions_per_capita=body.emissions_per_capita)
    with Session(engine) as db:
        db.add(r)
        db.commit()
        db.refresh(r)
        return region_out(r, db)


@router.patch("/{region_id}", dependencies=[Depends(require_password)])
def update_region(region_id: int, body: RegionPatch):
    with Session(engine) as db:
        r = db.get(Region, region_id)
        if not r:
            raise HTTPException(404, "region_not_found")
        for k, v in body.model_dump(exclude_unset=True).items():
            setattr(r, k, v)
        db.add(r)
        db.commit()
        db.refresh(r)
        return region_out(r, db)


@router.delete("/{region_id}", dependencies=[Depends(require_password)])
def delete_region(region_id: int):
    import shutil

    with Session(engine) as db:
        r = db.get(Region, region_id)
        if not r:
            raise HTTPException(404, "region_not_found")
        for run in db.exec(select(Run).where(Run.region_id == region_id)).all():
            if run.status == "running":
                raise HTTPException(409, "region_has_running_jobs")
            shutil.rmtree(get_settings().runs_dir / str(run.id), ignore_errors=True)
            db.delete(run)
        db.delete(r)
        db.commit()
    return {"ok": True}


@router.post("/parse", dependencies=[Depends(require_password)])
async def parse_upload(file: UploadFile = File(...)):
    """Converts an uploaded GeoJSON or zipped shapefile into a WGS84 GeoJSON geometry."""
    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "file_too_large")
    name = (file.filename or "").lower()
    try:
        if name.endswith(".zip"):
            geom = _read_shapefile_zip(raw)
        else:
            obj = json.loads(raw)
            geom = geometry_from_geojson(obj)
            crs_name = obj.get("crs", {}).get("properties", {}).get("name")
            if crs_name and "CRS84" not in crs_name and "4326" not in crs_name:
                geom = to_crs(geom, CRS.from_user_input(crs_name), 4326)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, "file_unreadable") from e
    geom = clean_geometry(geom)
    return {"geometry": mapping(geom), "area_km2": area_km2(geom)}


def _read_shapefile_zip(raw: bytes) -> BaseGeometry:
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = z.namelist()
    shp = next((n for n in names if n.lower().endswith(".shp")), None)
    if not shp:
        raise HTTPException(422, "shapefile_missing_shp")
    base = shp[:-4]

    def member(ext: str):
        n = next((x for x in names if x.lower() == (base + ext).lower()), None)
        return io.BytesIO(z.read(n)) if n else None

    reader = shapefile.Reader(shp=member(".shp"), shx=member(".shx"), dbf=member(".dbf"))
    geom = unary_union([shape(s.__geo_interface__) for s in reader.shapes()])
    prj = member(".prj")
    if prj is not None:
        crs = CRS.from_wkt(prj.read().decode("utf-8", "ignore"))
        if crs.to_epsg() != 4326:
            geom = to_crs(geom, crs, 4326)
    return geom
