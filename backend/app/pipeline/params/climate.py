"""Climate parameters: temperature stress (T1, T2) and solar radiation (SOL)."""

from calendar import monthrange

import numpy as np

# 1 kWh = 3.6 MJ
KWH_TO_MJ = 3.6


def t1(t_opt: float) -> float:
    return 0.8 + 0.02 * t_opt - 0.0005 * t_opt**2


def t2(t_mean, t_opt: float):
    """CASA T2 stress for a mean temperature (scalar or array, °C)."""
    a = np.exp(0.2 * (t_opt - 10 - np.asarray(t_mean, dtype=np.float64)))
    b = np.exp(0.3 * (-t_opt - 10 + np.asarray(t_mean, dtype=np.float64)))
    return 1.1814 / (1 + a) / (1 + b)


def monthly_sol_mj(daily_mj_m2: float, year: int, month: int) -> float:
    """Total monthly incoming shortwave radiation (MJ/m²/month)."""
    return daily_mj_m2 * monthrange(year, month)[1]
