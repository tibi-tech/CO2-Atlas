"""CASA net primary productivity model."""

import numpy as np

C_TO_CO2 = 44.0 / 12.0
PAR_FRACTION = 0.5


def npp(sol, fpar, t1, t2, wsc, emax) -> np.ndarray:
    """NPP in g C/m²/month (SOL in MJ/m²/month, E_max in g C/MJ)."""
    return (PAR_FRACTION * sol * fpar * t1 * t2 * wsc * emax).astype(np.float32)
