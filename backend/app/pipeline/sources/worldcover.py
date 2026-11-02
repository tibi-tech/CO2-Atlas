"""ESA WorldCover 2021 (v200) read directly from the public AWS Open Data bucket.

The map is published as 3°×3° Cloud-Optimised GeoTIFFs, so only the region's window is
downloaded: no queue, no Copernicus credits.
"""

import logging
import math
from pathlib import Path

import numpy as np
import rasterio
import rasterio.errors
import rasterio.windows
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from shapely.geometry.base import BaseGeometry

from app.pipeline.grid import Grid, write_raster

log = logging.getLogger(__name__)

BASE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
}


class WorldCoverError(RuntimeError):
    pass


def tile_names(geom: BaseGeometry) -> list[str]:
    w, s, e, n = geom.bounds
    names = []
    for lat in range(int(math.floor(s / 3) * 3), int(math.floor(n / 3) * 3) + 1, 3):
        for lon in range(int(math.floor(w / 3) * 3), int(math.floor(e / 3) * 3) + 1, 3):
            ns = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}"
            ew = f"{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
            names.append(f"ESA_WorldCover_10m_2021_v200_{ns}{ew}_Map.tif")
    return names


def fetch(geom: BaseGeometry, grid: Grid, out: Path) -> Path:
    """Reads the WorldCover classes covering the region onto the analysis grid."""
    from rasterio.warp import reproject

    result = np.full(grid.shape, np.nan, dtype=np.float32)
    w, s, e, n = geom.bounds
    pad = 0.002
    found = False
    with rasterio.Env(**GDAL_ENV):
        for name in tile_names(geom):
            url = f"/vsicurl/{BASE_URL}/{name}"
            try:
                src = rasterio.open(url)
            except rasterio.RasterioIOError:
                log.info("WorldCover tile %s not available (ocean?)", name)
                continue
            with src:
                win = from_bounds(w - pad, s - pad, e + pad, n + pad, src.transform)
                try:
                    win = win.round_offsets().round_lengths().intersection(
                        rasterio.windows.Window(0, 0, src.width, src.height))
                except rasterio.errors.WindowError:
                    continue
                data = src.read(1, window=win).astype(np.float32)
                tile = np.full(grid.shape, np.nan, dtype=np.float32)
                reproject(data, tile, src_transform=src.window_transform(win), src_crs=src.crs,
                          src_nodata=0, dst_transform=grid.transform, dst_crs=grid.crs,
                          dst_nodata=np.nan, resampling=Resampling.nearest)
                fill = np.isnan(result) & np.isfinite(tile)
                result[fill] = tile[fill]
                found = True
    if not found:
        raise WorldCoverError("No ESA WorldCover data found for this region")
    out.parent.mkdir(parents=True, exist_ok=True)
    write_raster(out, result, grid)
    return out
