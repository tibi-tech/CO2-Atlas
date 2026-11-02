"""Maximum light-use efficiency (E_max) by ESA WorldCover class."""

import numpy as np

WORLDCOVER_CLASSES: dict[int, str] = {
    10: "tree_cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built_up",
    60: "bare_sparse",
    70: "snow_ice",
    80: "water",
    90: "wetland",
    95: "mangroves",
    100: "moss_lichen",
}

# Values for classes 10-60 come from the original thesis; the rest are added so that
# every WorldCover class is defined (non-vegetated classes absorb nothing).
DEFAULT_EMAX: dict[int, float] = {
    10: 1.0,
    20: 0.7,
    30: 1.04,
    40: 0.9,
    50: 0.0,
    60: 0.25,
    70: 0.0,
    80: 0.0,
    90: 0.9,
    95: 1.0,
    100: 0.25,
}


def emax(landcover: np.ndarray, table: dict[int, float] | None = None) -> np.ndarray:
    table = table or DEFAULT_EMAX
    out = np.zeros(landcover.shape, dtype=np.float32)
    for code, value in table.items():
        out[landcover == int(code)] = value
    out[~np.isfinite(landcover)] = np.nan
    return out
