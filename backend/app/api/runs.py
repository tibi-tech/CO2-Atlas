import asyncio
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import require_password
from app.db.models import Region, Run, engine
from app.pipeline import runner
from app.pipeline.params import vegetation
from app.services import exports, worker
from app.services.render import LAYERS

router = APIRouter(prefix="/api/runs", tags=["runs"])

# Sentinel-2 L2A is available globally from 2017-04
FIRST_MONTH = (2017, 4)


class RunIn(BaseModel):
    region_id: int
    year: int
    months: list[int] = Field(min_length=1)
    method: str = Field(default="improved", pattern="^(improved|legacy)$")
    population: int | None = Field(default=None, ge=0)
    emissions_per_capita: float | None = Field(default=None, ge=0)
    emissions_total: float | None = Field(default=None, ge=0)  # t CO2 / month
    fpar_fixed: bool = True
    ndvi_min: float = Field(default=vegetation.NDVI_MIN, ge=-1, le=1)
    ndvi_max: float = Field(default=vegetation.NDVI_MAX, ge=-1, le=1)
    emax_table: dict[int, float] | None = None
    t_opt: float | None = Field(default=None, ge=-30, le=50)

    @model_validator(mode="after")
    def check(self):
        if self.ndvi_max <= self.ndvi_min:
            raise ValueError("ndvi_range_invalid")
        if len(self.months) > get_settings().max_months_per_job:
            raise ValueError("too_many_months")
        today = date.today()
        for m in self.months:
            if not 1 <= m <= 12:
                raise ValueError("month_invalid")
            if (self.year, m) < FIRST_MONTH or (self.year, m) >= (today.year, today.month):
                raise ValueError("month_out_of_range")
        return self


def run_out(r: Run, full: bool = True) -> dict:
    d = r.model_dump()
    if not full and d.get("result"):
        res = d["result"]
        d["result"] = {k: res.get(k) for k in ("absorbed_co2_t", "absorbed_c_t",
                                               "emissions_co2_t", "offset_pct", "notes")}
    return d


def _get(db: Session, run_id: int) -> Run:
    r = db.get(Run, run_id)
    if not r:
        raise HTTPException(404, "run_not_found")
    return r


@router.post("", dependencies=[Depends(require_password)])
def create_runs(body: RunIn):
    with Session(engine) as db:
        region = db.get(Region, body.region_id)
        if not region:
            raise HTTPException(404, "region_not_found")
        if body.method == "legacy" and not (region.reference and body.year == 2024
                                            and body.months == [6]):
            raise HTTPException(422, "legacy_only_reference")
        if body.emissions_total is not None:
            emissions = body.emissions_total
        else:
            pop = body.population if body.population is not None else region.population
            pc = (body.emissions_per_capita if body.emissions_per_capita is not None
                  else region.emissions_per_capita)
            emissions = (pop or 0) * (pc or 0)
        params = {
            "emissions_co2_t": emissions, "fpar_fixed": body.fpar_fixed,
            "ndvi_min": body.ndvi_min, "ndvi_max": body.ndvi_max, "t_opt": body.t_opt,
        }
        if body.emax_table:
            params["emax_table"] = {int(k): float(v) for k, v in body.emax_table.items()}
        runs = []
        for m in sorted(set(body.months)):
            r = Run(region_id=region.id, year=body.year, month=m, method=body.method,
                    params=params,
                    steps={s: {"status": "pending", "message": None} for s in runner.STEPS})
            db.add(r)
            runs.append(r)
        db.commit()
        for r in runs:
            db.refresh(r)
            worker.enqueue(r.id)
        return [run_out(r) for r in runs]


@router.get("")
def list_runs(region_id: int | None = None, limit: int = Query(100, le=500)):
    with Session(engine) as db:
        q = select(Run).order_by(Run.id.desc()).limit(limit)
        if region_id is not None:
            q = q.where(Run.region_id == region_id)
        return [run_out(r, full=False) for r in db.exec(q).all()]


@router.get("/{run_id}")
def get_run(run_id: int):
    with Session(engine) as db:
        return run_out(_get(db, run_id))


@router.get("/{run_id}/events")
async def run_events(run_id: int):
    async def stream():
        last = None
        while True:
            with Session(engine) as db:
                r = db.get(Run, run_id)
                if r is None:
                    break
                payload = json.dumps({"status": r.status, "steps": r.steps, "error": r.error})
            if payload != last:
                yield f"data: {payload}\n\n"
                last = payload
            if r.status in ("done", "failed"):
                break
            await asyncio.sleep(1)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache"})


@router.post("/{run_id}/retry", dependencies=[Depends(require_password)])
def retry_run(run_id: int):
    with Session(engine) as db:
        r = _get(db, run_id)
        if r.status in ("queued", "running"):
            raise HTTPException(409, "run_active")
        r.status, r.error, r.result = "queued", None, None
        r.steps = {s: {"status": "pending", "message": None} for s in runner.STEPS}
        db.add(r)
        db.commit()
        worker.enqueue(r.id)
        return run_out(r)


@router.delete("/{run_id}", dependencies=[Depends(require_password)])
def delete_run(run_id: int):
    import shutil

    with Session(engine) as db:
        r = _get(db, run_id)
        if r.status == "running":
            raise HTTPException(409, "run_active")
        shutil.rmtree(worker.run_dir(run_id), ignore_errors=True)
        db.delete(r)
        db.commit()
    return {"ok": True}


@router.get("/{run_id}/sample")
def sample(run_id: int, lon: float, lat: float):
    """Values of every layer at a point (WGS84)."""
    import math

    import rasterio
    from pyproj import Transformer

    d = worker.run_dir(run_id)
    out: dict[str, float | None] = {}
    for f in sorted(d.glob("*.tif")):
        with rasterio.open(f) as src:
            x, y = Transformer.from_crs(4326, src.crs, always_xy=True).transform(lon, lat)
            row, col = src.index(x, y)
            if 0 <= row < src.height and 0 <= col < src.width:
                v = float(src.read(1, window=((row, row + 1), (col, col + 1)))[0, 0])
                out[f.stem] = None if math.isnan(v) else v
            else:
                out[f.stem] = None
    if not out:
        raise HTTPException(404, "run_not_found")
    return out


@router.get("/{run_id}/layers/{name}.png")
def layer_png(run_id: int, name: str):
    if name not in LAYERS:
        raise HTTPException(404, "layer_not_found")
    f = worker.run_dir(run_id) / f"{name}.png"
    if not f.exists():
        raise HTTPException(404, "layer_not_found")
    return FileResponse(f, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@router.get("/{run_id}/export.{fmt}")
def export(run_id: int, fmt: str, lang: str = Query("en", pattern="^(en|pt)$")):
    with Session(engine) as db:
        r = _get(db, run_id)
        if r.status != "done" or not r.result:
            raise HTTPException(409, "run_not_done")
        region = db.get(Region, r.region_id)
        result, region_name = r.result, region.name
    d = worker.run_dir(run_id)
    stem = f"co2_{region_name.lower().replace(' ', '_')}_{r.year}-{r.month:02d}"
    if fmt == "zip":
        content, media = exports.zip_layers(d), "application/zip"
    elif fmt == "csv":
        content, media = exports.to_csv(region_name, result, lang).encode("utf-8-sig"), "text/csv"
    elif fmt == "pdf":
        content, media = exports.to_pdf(region_name, result, d, lang), "application/pdf"
    else:
        raise HTTPException(404, "format_not_supported")
    return Response(content, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{stem}.{fmt}"'})


timeseries_router = APIRouter(prefix="/api/regions", tags=["regions"])


@timeseries_router.get("/{region_id}/timeseries")
def timeseries(region_id: int, method: str = "improved"):
    """Latest completed run per month for a region."""
    with Session(engine) as db:
        runs = db.exec(select(Run).where(Run.region_id == region_id, Run.status == "done",
                                         Run.method == method).order_by(Run.id)).all()
    latest: dict[tuple[int, int], Run] = {}
    for r in runs:
        latest[(r.year, r.month)] = r
    return [
        {"run_id": r.id, "year": y, "month": m,
         "absorbed_co2_t": r.result["absorbed_co2_t"],
         "emissions_co2_t": r.result["emissions_co2_t"],
         "offset_pct": r.result["offset_pct"],
         "mean_npp_c_kg_ha": r.result["mean_npp_c_kg_ha"]}
        for (y, m), r in sorted(latest.items())
    ]
