"""Turn the NPP raster into totals, per-land-cover figures and the emissions balance."""

import numpy as np

from app.pipeline.npp import C_TO_CO2
from app.pipeline.params.landcover import WORLDCOVER_CLASSES


def layer_stats(arr: np.ndarray) -> dict:
    v = arr[np.isfinite(arr)]
    if v.size == 0:
        return {"min": None, "max": None, "mean": None, "p2": None, "p98": None}
    return {
        "min": float(v.min()), "max": float(v.max()), "mean": float(v.mean()),
        "p2": float(np.percentile(v, 2)), "p98": float(np.percentile(v, 98)),
    }


def analyse(npp: np.ndarray, landcover: np.ndarray | None, pixel_area_m2: float,
            emissions_t_co2: float) -> dict:
    """npp in g C/m²/month, NaN outside the region."""
    inside = np.isfinite(npp)
    npp0 = np.where(inside, npp, 0.0)
    g_to_t = pixel_area_m2 / 1e6

    total_c = float(npp0.sum() * g_to_t)
    total_co2 = total_c * C_TO_CO2
    vegetated = inside & (npp0 > 0)
    mean_c_kg_ha = float(npp0[vegetated].mean() * 10) if vegetated.any() else 0.0

    by_class = []
    if landcover is not None:
        for code, name in WORLDCOVER_CLASSES.items():
            sel = inside & (landcover == code)
            n = int(sel.sum())
            if n == 0:
                continue
            c = float(npp0[sel].sum() * g_to_t)
            by_class.append({
                "code": code, "name": name,
                "area_ha": n * pixel_area_m2 / 1e4,
                "c_t": c, "co2_t": c * C_TO_CO2,
            })

    emissions_c = emissions_t_co2 / C_TO_CO2
    return {
        "area_ha": float(inside.sum() * pixel_area_m2 / 1e4),
        "vegetated_area_ha": float(vegetated.sum() * pixel_area_m2 / 1e4),
        "absorbed_c_t": total_c,
        "absorbed_co2_t": total_co2,
        "emissions_co2_t": emissions_t_co2,
        "emissions_c_t": emissions_c,
        "offset_pct": (total_co2 / emissions_t_co2 * 100) if emissions_t_co2 > 0 else None,
        "mean_npp_c_kg_ha": mean_c_kg_ha,
        "mean_npp_co2_kg_ha": mean_c_kg_ha * C_TO_CO2,
        "by_landcover": by_class,
    }
