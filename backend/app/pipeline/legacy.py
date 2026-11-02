"""The original thesis method, reproduced with correct georeferencing.

Only used for the bundled Oeiras reference (June 2024) and regression tests: it relies on
local inputs (Sentinel-3 LST, Portugal GHI raster) that are not available for any region.
"""

from calendar import monthrange
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from shapely import wkt
from shapely.geometry import box

from app.pipeline import analysis
from app.pipeline.grid import Grid, read_to_grid
from app.pipeline.npp import npp as casa_npp
from app.pipeline.params import climate, landcover, vegetation

# Monthly variation (%) of solar radiation relative to the annual daily mean (Oeiras)
VAR_PCT_MES = {
    1: -53.57138918, 2: -35.49327248, 3: -17.53257806, 4: 21.45016561,
    5: 52.10518815, 6: 42.992943, 7: 63.0189765, 8: 55.56084036,
    9: 20.07604713, 10: -32.22469972, 11: -49.63097221, 12: -49.23973522,
}
# The thesis multiplied GHI by 44/12 (instead of 3.6) to convert kWh to MJ; kept for parity.
THESIS_SOL_FACTOR = 44 / 12
THESIS_EMAX = {10: 1.0, 20: 0.7, 30: 1.04, 40: 0.9, 60: 0.25}


def run_legacy(fixtures: Path, year: int, month: int) -> tuple[Grid, dict[str, np.ndarray]]:
    with rasterio.open(fixtures / "s2_masked.tif") as src:
        grid = Grid(src.crs, src.transform, src.width, src.height)
        red, nir, b11, b12 = (src.read(i).astype(np.float32) for i in (1, 2, 3, 4))

    ndvi = vegetation.ndvi(red, nir)
    fpar = vegetation.fpar(ndvi, None, None)
    wsc = vegetation.wsc(b11, b12, robust=False)

    day = read_to_grid(fixtures / "lst_day.tif", grid, resampling=Resampling.nearest) - 273.15
    night = read_to_grid(fixtures / "lst_night.tif", grid, resampling=Resampling.nearest) - 273.15
    t_mean = 0.5 * (day + night)
    valid = np.isfinite(t_mean) & (t_mean > -50) & (t_mean < 60)
    t_opt = float(np.mean(t_mean[valid])) if valid.any() else 20.0
    t2 = climate.t2(t_mean, t_opt).astype(np.float32)
    ok = np.isfinite(t2) & (t2 > 0)
    t2[~ok] = t2[ok].mean()

    square = wkt.loads((fixtures / "sol_square.wkt").read_text().strip())
    with rasterio.open(fixtures / "ghi.tif") as src:
        win = src.window(*square.bounds)
        ghi = src.read(1, window=win)
        ghi_transform = src.window_transform(win)
        ghi_crs = src.crs
    from app.pipeline.grid import warp

    ghi_grid = warp(ghi, ghi_transform, ghi_crs, grid, Resampling.nearest)
    sol = (ghi_grid * THESIS_SOL_FACTOR * (1 + VAR_PCT_MES[month] / 100)
           * monthrange(year, month)[1])

    lc = read_to_grid(fixtures / "worldcover.tif", grid, resampling=Resampling.nearest)
    emax = landcover.emax(lc, THESIS_EMAX)

    t1 = climate.t1(t_opt)
    npp = casa_npp(sol, fpar, t1, t2, wsc, emax)
    return grid, {
        "ndvi": ndvi, "fpar": fpar, "wsc": wsc, "t_mean": t_mean.astype(np.float32),
        "t2": t2, "sol": sol.astype(np.float32), "landcover": lc, "emax": emax,
        "npp": npp, "_t1": np.float32(t1), "_t_opt": np.float32(t_opt),
    }


def region_bbox(fixtures: Path):
    with rasterio.open(fixtures / "s2_masked.tif") as src:
        return box(*src.bounds)


def legacy_analysis(fixtures: Path, year: int, month: int, emissions_t_co2: float) -> dict:
    grid, layers = run_legacy(fixtures, year, month)
    return analysis.analyse(layers["npp"], layers["landcover"], grid.pixel_area_m2,
                            emissions_t_co2)
