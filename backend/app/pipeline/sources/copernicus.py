"""Copernicus Data Space openEO: Sentinel-2 L2A composites."""

import logging
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path

import openeo
from shapely.geometry.base import BaseGeometry

from app.core.config import get_settings

log = logging.getLogger(__name__)

S2_BANDS = ["B04", "B08", "B11", "B12"]
# Scene classification classes to drop: no data, saturated, cloud shadow, clouds, cirrus
SCL_INVALID = (0, 1, 3, 8, 9, 10)

StatusCallback = Callable[[str], None]


class OpenEOError(RuntimeError):
    pass


def connect() -> openeo.Connection:
    from app.services import credentials

    s = get_settings()
    conn = openeo.connect(s.openeo_url)
    creds = credentials.get()
    if creds:
        conn.authenticate_oidc_client_credentials(
            client_id=creds.client_id, client_secret=creds.client_secret
        )
    else:
        # Uses a refresh token stored by `python -m app.cli login`
        try:
            conn.authenticate_oidc_refresh_token()
        except Exception as e:  # noqa: BLE001
            raise OpenEOError(
                "Copernicus credentials missing: add them in Settings, set "
                "CDSE_CLIENT_ID/CDSE_CLIENT_SECRET, or run `python -m app.cli login` once."
            ) from e
    return conn


def _extent(geom: BaseGeometry) -> dict:
    w, s, e, n = geom.bounds
    pad = 0.002
    return {"west": w - pad, "south": s - pad, "east": e + pad, "north": n + pad, "crs": 4326}


def _fmt_elapsed(seconds: float) -> str:
    m = int(seconds // 60)
    return f"{m} min" if m else f"{int(seconds)} s"


def _run(cube, out: Path, title: str, on_status: StatusCallback | None = None) -> Path:
    """Runs an openEO batch job, reporting queue/run status and enforcing a time limit."""
    timeout = get_settings().openeo_timeout_min * 60
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part.tif")
    job = cube.create_job(title=title, out_format="GTiff")
    job.start()
    log.info("openEO job %s started: %s", job.job_id, title)
    started = time.monotonic()
    interval = 5.0
    last_status = None
    while True:
        status = job.status()
        elapsed = time.monotonic() - started
        if status != last_status:
            log.info("openEO job %s: %s (%s)", job.job_id, status, _fmt_elapsed(elapsed))
            last_status = status
        if on_status:
            on_status(f"{status}|{int(elapsed)}")
        if status == "finished":
            break
        if status in ("error", "canceled"):
            msg = ""
            try:
                errs = [e.get("message", "") for e in job.logs(level="error")][-1:]
                msg = f": {errs[0][:300]}" if errs else ""
            except Exception:  # noqa: BLE001
                pass
            raise OpenEOError(f"Copernicus job {status}{msg}")
        if elapsed > timeout:
            try:
                job.stop()
            except Exception:  # noqa: BLE001
                pass
            raise OpenEOError(
                f"Copernicus did not finish within {get_settings().openeo_timeout_min} min "
                f"(last status: {status}). The service may be busy — retry later."
            )
        time.sleep(interval)
        interval = min(interval * 1.3, 30.0)

    assets = job.get_results().get_assets()
    tif = next((a for a in assets if getattr(a, "key", a.name).endswith((".tif", ".tiff"))), None)
    if tif is None:
        raise OpenEOError(f"openEO job {job.job_id} produced no GeoTIFF")
    tif.download(tmp)
    tmp.replace(out)
    return out


def sentinel2_composite(conn: openeo.Connection, geom: BaseGeometry, start: date, end: date,
                        epsg: int, out: Path, on_status: StatusCallback | None = None) -> Path:
    """Cloud-masked median composite of B04, B08, B11, B12 between start (incl.) and end."""
    cube = conn.load_collection(
        "SENTINEL2_L2A",
        spatial_extent=_extent(geom),
        temporal_extent=[start.isoformat(), end.isoformat()],
        bands=[*S2_BANDS, "SCL"],
        max_cloud_cover=80,
    )
    scl = cube.band("SCL")
    invalid = None
    for c in SCL_INVALID:
        cond = scl == c
        invalid = cond if invalid is None else (invalid | cond)
    cube = cube.filter_bands(S2_BANDS).mask(invalid)
    cube = cube.reduce_dimension(dimension="t", reducer="median")
    cube = cube.resample_spatial(resolution=10, projection=epsg, method="near")
    return _run(cube, out, f"S2 composite {start}..{end}", on_status)
