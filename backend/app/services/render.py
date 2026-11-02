"""Render GeoTIFF layers to coloured web-map PNG overlays (EPSG:3857)."""

from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject

from app.pipeline.grid import Grid
from app.pipeline.params.landcover import WORLDCOVER_CLASSES

PALETTES: dict[str, list[str]] = {
    "ndvi": ["#a50026", "#f46d43", "#fee08b", "#d9ef8b", "#66bd63", "#006837"],
    "greens": ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
    "water": ["#8c510a", "#d8b365", "#f6e8c3", "#5ab4ac", "#01665e"],
    "heat": ["#313695", "#74add1", "#ffffbf", "#f46d43", "#a50026"],
    "viridis": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
}

LANDCOVER_COLORS = {
    10: "#006400", 20: "#ffbb22", 30: "#ffff4c", 40: "#f096ff", 50: "#fa0000",
    60: "#b4b4b4", 70: "#f0f0f0", 80: "#0064c8", 90: "#0096a0", 95: "#00cf75",
    100: "#fae6a0",
}

LAYERS: dict[str, dict] = {
    "ndvi": {"palette": "ndvi", "unit": "", "range": (-0.2, 0.9)},
    "fpar": {"palette": "greens", "unit": "", "range": (0, 0.95)},
    "wsc": {"palette": "water", "unit": "", "range": (0.5, 1.0)},
    "t_mean": {"palette": "heat", "unit": "°C", "range": None},
    "sol": {"palette": "heat", "unit": "MJ/m²", "range": None},
    "emax": {"palette": "viridis", "unit": "g C/MJ", "range": (0, 1.1)},
    "landcover": {"palette": "categorical", "unit": "", "range": None},
    "npp": {"palette": "greens", "unit": "g C/m²", "range": None},
    "co2": {"palette": "greens", "unit": "g CO₂/m²", "range": None},
}


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def _lut(stops: list[str]) -> np.ndarray:
    cols = np.array([_hex(c) for c in stops], dtype=np.float32)
    x = np.linspace(0, 1, len(stops))
    xi = np.linspace(0, 1, 256)
    return np.stack([np.interp(xi, x, cols[:, i]) for i in range(3)], axis=1).astype(np.uint8)


def _to_mercator(data: np.ndarray, grid: Grid, categorical: bool):
    dst_crs = "EPSG:3857"
    left, bottom, right, top = grid.bounds
    transform, w, h = calculate_default_transform(
        grid.crs, dst_crs, grid.width, grid.height, left, bottom, right, top
    )
    scale = max(1.0, max(w, h) / 2048)
    w, h = int(w / scale), int(h / scale)
    transform = transform @ transform.scale(scale, scale)
    out = np.full((h, w), np.nan, dtype=np.float32)
    reproject(
        data.astype(np.float32), out, src_transform=grid.transform, src_crs=grid.crs,
        dst_transform=transform, dst_crs=dst_crs, src_nodata=np.nan, dst_nodata=np.nan,
        resampling=Resampling.nearest if categorical else Resampling.bilinear,
    )
    to_ll = Transformer.from_crs(dst_crs, 4326, always_xy=True)
    x0, y0 = transform.c, transform.f
    x1, y1 = x0 + transform.a * w, y0 + transform.e * h
    (lon0, lon1), (lat0, lat1) = to_ll.transform([x0, x1], [y0, y1])
    # MapLibre image source corners: top-left, top-right, bottom-right, bottom-left
    coords = [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1]]
    return out, coords


def render(name: str, data: np.ndarray, grid: Grid, out_png: Path, stats: dict) -> dict:
    cfg = LAYERS[name]
    categorical = cfg["palette"] == "categorical"
    merc, coords = _to_mercator(data, grid, categorical)
    rgba = np.zeros((*merc.shape, 4), dtype=np.uint8)
    valid = np.isfinite(merc)
    meta: dict = {"name": name, "unit": cfg["unit"], "coordinates": coords}

    if categorical:
        for code, color in LANDCOVER_COLORS.items():
            sel = valid & (merc == code)
            rgba[sel, :3] = _hex(color)
            rgba[sel, 3] = 220
        meta["legend"] = [
            {"code": c, "name": WORLDCOVER_CLASSES[c], "color": LANDCOVER_COLORS[c]}
            for c in WORLDCOVER_CLASSES
        ]
    else:
        lo, hi = cfg["range"] or (stats.get("p2") or 0.0, stats.get("p98") or 1.0)
        if hi <= lo:
            hi = lo + 1e-6
        lut = _lut(PALETTES[cfg["palette"]])
        idx = np.clip((np.nan_to_num(merc) - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
        rgba[..., :3] = lut[idx]
        rgba[..., 3] = np.where(valid, 230, 0)
        meta.update({"min": lo, "max": hi, "palette": PALETTES[cfg["palette"]]})

    Image.fromarray(rgba, "RGBA").save(out_png, optimize=True)
    return meta
