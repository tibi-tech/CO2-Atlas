"""Vegetation parameters from Sentinel-2 surface reflectance (scaled by 10000)."""

import numpy as np

REFLECTANCE_SCALE = 10000.0

# FPAR: CASA NDVI references (Zhu et al. 2006 — NDVI_min of bare land, NDVI_max of dense
# vegetation), fixed so different months/regions are comparable.
NDVI_MIN = 0.023
NDVI_MAX = 0.70
FPAR_MIN = 0.001
FPAR_MAX = 0.95
# WSC follows Fensholt & Sandholt (2003): SIMI is normalised within the scene. Percentiles
# keep a few extreme pixels (water, bright roofs) from stretching the range.
SIMI_PERCENTILES = (2.0, 98.0)


def ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    red = red.astype(np.float32)
    nir = nir.astype(np.float32)
    den = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(den != 0, (nir - red) / den, np.nan)
    return out.astype(np.float32)


def fpar(ndvi_arr: np.ndarray, ndvi_min: float | None = NDVI_MIN,
         ndvi_max: float | None = NDVI_MAX) -> np.ndarray:
    """Linear NDVI -> FPAR scaling. Pass None to use scene min/max (thesis method)."""
    valid = np.isfinite(ndvi_arr)
    if not valid.any():
        raise ValueError("No valid NDVI pixels")
    lo = float(np.min(ndvi_arr[valid])) if ndvi_min is None else ndvi_min
    hi = float(np.max(ndvi_arr[valid])) if ndvi_max is None else ndvi_max
    if np.isclose(hi, lo):
        hi = lo + 1e-5
    scaled = (np.clip(ndvi_arr, lo, hi) - lo) * (FPAR_MAX - FPAR_MIN) / (hi - lo) + FPAR_MIN
    return np.where(valid, scaled, np.nan).astype(np.float32)


def wsc(b11: np.ndarray, b12: np.ndarray, robust: bool = True) -> np.ndarray:
    """Water stress coefficient from the Shortwave Infrared Moisture Index (0.5..1).

    SIMI is normalised within the scene: by its 2nd-98th percentiles (robust) or by its
    min/max (thesis method).
    """
    b11 = b11.astype(np.float32) / REFLECTANCE_SCALE
    b12 = b12.astype(np.float32) / REFLECTANCE_SCALE
    simi = 0.7071 * np.sqrt(b11**2 + b12**2)
    valid = np.isfinite(simi)
    if not valid.any():
        raise ValueError("No valid SWIR pixels")
    if robust:
        lo, hi = (float(v) for v in np.percentile(simi[valid], SIMI_PERCENTILES))
    else:
        lo, hi = float(np.min(simi[valid])), float(np.max(simi[valid]))
    if np.isclose(hi, lo):
        hi = lo + 1e-5
    nsimi = np.clip((simi - lo) / (hi - lo), 0, 1)
    return np.where(valid, 0.5 + 0.5 * (1 - nsimi), np.nan).astype(np.float32)
