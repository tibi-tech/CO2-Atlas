"""Runs one month of the CO2 absorption pipeline for a region."""

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import numpy as np
from rasterio.enums import Resampling
from shapely.geometry.base import BaseGeometry

from app.core.config import get_settings
from app.pipeline import analysis, legacy
from app.pipeline.grid import Grid, make_grid, read_to_grid, region_mask, write_raster
from app.pipeline.npp import C_TO_CO2
from app.pipeline.npp import npp as casa_npp
from app.pipeline.params import climate, landcover, vegetation
from app.services import render

log = logging.getLogger(__name__)

STEPS = ["climate", "sentinel2", "landcover", "parameters", "npp", "analysis", "render"]
MIN_S2_COVERAGE = 0.6

Progress = Callable[[str, str, str | None], None]  # (step, status, message)


@dataclass
class RunParams:
    year: int
    month: int
    emissions_co2_t: float
    method: str = "improved"  # "improved" | "legacy"
    fpar_fixed: bool = True
    ndvi_min: float = vegetation.NDVI_MIN
    ndvi_max: float = vegetation.NDVI_MAX
    emax_table: dict[int, float] = field(default_factory=lambda: dict(landcover.DEFAULT_EMAX))
    t_opt: float | None = None


def region_key(geom: BaseGeometry) -> str:
    return hashlib.sha1(geom.wkb).hexdigest()[:16]


def _month_range(year: int, month: int, extra: int = 0) -> tuple[date, date]:
    def shift(y: int, m: int, d: int) -> tuple[int, int]:
        m += d
        return y + (m - 1) // 12, (m - 1) % 12 + 1

    sy, sm = shift(year, month, -extra)
    ey, em = shift(year, month, extra + 1)
    return date(sy, sm, 1), date(ey, em, 1)


def execute(run_dir: Path, geom: BaseGeometry, p: RunParams, progress: Progress) -> dict:
    run_dir.mkdir(parents=True, exist_ok=True)
    if p.method == "legacy":
        return _execute_legacy(run_dir, p, progress)

    s = get_settings()
    cache = s.cache_dir / "regions" / region_key(geom)
    cache.mkdir(parents=True, exist_ok=True)
    notes: list[str] = []
    grid = make_grid(geom)
    inside = region_mask(grid, geom)

    progress("climate", "running", None)
    from app.pipeline.sources import power

    c = geom.centroid
    clim = power.climate_for_month(c.y, c.x, p.year, p.month, s.cache_dir / "power")
    notes += clim["notes"]
    t_opt = p.t_opt if p.t_opt is not None else clim["t_opt"]
    progress("climate", "done", f"T={clim['t_mean']:.1f}°C, SOL={clim['sol_daily_mj']:.1f} MJ/m²/d")

    progress("sentinel2", "running", None)
    from app.pipeline.sources import copernicus

    conn = None

    def get_conn():
        nonlocal conn
        conn = conn or copernicus.connect()
        return conn

    epsg = grid.crs.to_epsg()

    def s2_status(raw: str) -> None:
        status, secs = raw.split("|")
        progress("sentinel2", "running", f"openeo:{status}:{secs}")

    bands = None
    for extra in (0, 1):
        start, end = _month_range(p.year, p.month, extra)
        tif = cache / f"s2_{start:%Y%m}_{end:%Y%m}.tif"
        if not tif.exists():
            progress("sentinel2", "running", "openeo:created:0")
            copernicus.sentinel2_composite(get_conn(), geom, start, end, epsg, tif, s2_status)
        bands = [read_to_grid(tif, grid, b, Resampling.bilinear) for b in (1, 2, 3, 4)]
        valid = np.isfinite(bands[0]) & (bands[0] > 0)
        coverage = float((valid & inside).sum() / max(inside.sum(), 1))
        if coverage >= MIN_S2_COVERAGE:
            break
        log.info("Sentinel-2 coverage %.0f%% for %s..%s", coverage * 100, start, end)
    if extra:
        notes.append("extended_window")
    for b in bands:
        b[~(np.isfinite(b) & (b > 0) & inside)] = np.nan
    progress("sentinel2", "done", f"{coverage * 100:.0f}% clear pixels")

    progress("landcover", "running", None)
    from app.pipeline.sources import worldcover

    wc = cache / f"worldcover_v200_{region_key(geom)}.tif"
    if not wc.exists():
        worldcover.fetch(geom, grid, wc)
    lc = read_to_grid(wc, grid, 1, Resampling.nearest)
    progress("landcover", "done", "ESA WorldCover 2021")

    progress("parameters", "running", None)
    red, nir, b11, b12 = bands
    ndvi = vegetation.ndvi(red, nir)
    lo, hi = (p.ndvi_min, p.ndvi_max) if p.fpar_fixed else (None, None)
    fpar = vegetation.fpar(ndvi, lo, hi)
    wsc = vegetation.wsc(b11, b12)
    t1 = climate.t1(t_opt)
    t2 = float(climate.t2(clim["t_mean"], t_opt))
    sol = climate.monthly_sol_mj(clim["sol_daily_mj"], p.year, p.month)
    emax = landcover.emax(lc, {int(k): v for k, v in p.emax_table.items()})
    progress("parameters", "done", None)

    progress("npp", "running", None)
    npp = casa_npp(sol, fpar, t1, t2, wsc, emax)
    npp[~inside] = np.nan
    progress("npp", "done", None)

    layers = {"ndvi": ndvi, "fpar": fpar, "wsc": wsc, "emax": emax, "landcover": lc, "npp": npp}
    scalars = {"t_mean": clim["t_mean"], "t_opt": t_opt, "t1": t1, "t2": t2, "sol": sol,
               "sol_daily": clim["sol_daily_mj"], "s2_coverage": coverage}
    return _finish(run_dir, grid, inside, layers, scalars, p, notes, progress)


def _execute_legacy(run_dir: Path, p: RunParams, progress: Progress) -> dict:
    s = get_settings()
    for st in ("climate", "sentinel2", "landcover", "parameters"):
        progress(st, "running", None)
    grid, layers = legacy.run_legacy(s.fixtures_dir, p.year, p.month)
    for st in ("climate", "sentinel2", "landcover", "parameters", "npp"):
        progress(st, "done", "thesis inputs (bundled)")
    inside = np.isfinite(layers["npp"])
    scalars = {"t_opt": float(layers.pop("_t_opt")), "t1": float(layers.pop("_t1")),
               "t_mean": float(np.nanmean(layers["t_mean"])),
               "sol": float(np.nanmean(layers["sol"]))}
    layers.pop("t2")
    return _finish(run_dir, grid, inside, layers, scalars, p, ["thesis_method"], progress)


def _finish(run_dir: Path, grid: Grid, inside: np.ndarray, layers: dict, scalars: dict,
            p: RunParams, notes: list[str], progress: Progress) -> dict:
    progress("analysis", "running", None)
    layers["co2"] = layers["npp"] * C_TO_CO2
    for k, v in layers.items():
        if k != "npp" and k != "co2":
            v = v.copy()
            v[~inside] = np.nan
            layers[k] = v
    result = analysis.analyse(layers["npp"], layers["landcover"], grid.pixel_area_m2,
                              p.emissions_co2_t)
    progress("analysis", "done", None)

    progress("render", "running", None)
    layer_meta = {}
    for name, arr in layers.items():
        write_raster(run_dir / f"{name}.tif", arr, grid)
        stats = analysis.layer_stats(arr)
        meta = render.render(name, arr, grid, run_dir / f"{name}.png", stats)
        layer_meta[name] = {**meta, "stats": stats}
    progress("render", "done", None)

    result.update({
        "method": p.method, "year": p.year, "month": p.month,
        "parameters": {k: (float(v) if v is not None else None) for k, v in scalars.items()},
        "settings": {"fpar_fixed": p.fpar_fixed, "ndvi_min": p.ndvi_min, "ndvi_max": p.ndvi_max,
                     "emax_table": {str(k): v for k, v in p.emax_table.items()}},
        "notes": notes, "layers": layer_meta, "pixel_area_m2": grid.pixel_area_m2,
    })
    (run_dir / "result.json").write_text(json.dumps(result, indent=2))
    return result
