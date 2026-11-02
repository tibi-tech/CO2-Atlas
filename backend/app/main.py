import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.api import regions, runs, settings
from app.core.config import get_settings
from app.core.security import require_password
from app.db.models import Region, Run, engine, init_db
from app.pipeline.params import vegetation
from app.pipeline.params.landcover import DEFAULT_EMAX, WORLDCOVER_CLASSES
from app.pipeline.runner import STEPS
from app.services import credentials, worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# openEO logs signed result-download URLs (temporary access tokens) at INFO level
logging.getLogger("openeo.rest.job").setLevel(logging.WARNING)
logging.getLogger("openeo.rest.auth").setLevel(logging.WARNING)

OEIRAS_POPULATION = 172120
OEIRAS_EMISSIONS_PER_CAPITA = 0.8917


def seed() -> None:
    s = get_settings()
    with Session(engine) as db:
        if not s.seed_oeiras or db.exec(select(Region)).first():
            return
        feature = json.loads((s.fixtures_dir / "boundary.geojson").read_text())
        from app.pipeline.grid import area_km2, geometry_from_geojson

        r = Region(name="Oeiras", geometry=feature["geometry"],
                   area_km2=area_km2(geometry_from_geojson(feature)),
                   population=OEIRAS_POPULATION,
                   emissions_per_capita=OEIRAS_EMISSIONS_PER_CAPITA, reference=True)
        db.add(r)
        db.commit()
        db.refresh(r)
        db.add(Run(region_id=r.id, year=2024, month=6, method="legacy",
                   params={"emissions_co2_t": OEIRAS_POPULATION * OEIRAS_EMISSIONS_PER_CAPITA,
                           "fpar_fixed": False}))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed()
    worker.start()
    yield


app = FastAPI(title="CO2 Absorption Calculator", version="2.0.0", lifespan=lifespan)
app.include_router(regions.router)
app.include_router(runs.timeseries_router)
app.include_router(runs.router)
app.include_router(settings.router)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/config")
def config():
    s = get_settings()
    with Session(engine) as db:
        queued = len(db.exec(select(Run).where(Run.status.in_(["queued", "running"]))).all())
    return {
        "password_required": bool(s.demo_password),
        "copernicus_configured": credentials.get() is not None,
        "max_region_km2": s.max_region_km2,
        "max_months_per_job": s.max_months_per_job,
        "steps": STEPS,
        "worldcover_classes": WORLDCOVER_CLASSES,
        "default_emax": DEFAULT_EMAX,
        "default_ndvi_min": vegetation.NDVI_MIN,
        "default_ndvi_max": vegetation.NDVI_MAX,
        "queue_length": queued,
    }


@app.post("/api/auth/check", dependencies=[Depends(require_password)])
def auth_check():
    return {"ok": True}


_dist = get_settings().frontend_dist
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = _dist / path
        if path and f.is_file() and _dist in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
