"""NASA POWER monthly point data: solar radiation and 2 m air temperature."""

import json
import logging
from pathlib import Path

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

FILL = -999.0


class PowerError(RuntimeError):
    pass


def fetch_year(lat: float, lon: float, year: int, cache_dir: Path) -> dict[str, dict[int, float]]:
    """Returns {"sol": {month: MJ/m²/day}, "t2m": {month: °C}} for one year (cached)."""
    cache = cache_dir / f"power_{lat:.3f}_{lon:.3f}_{year}.json"
    if cache.exists():
        raw = json.loads(cache.read_text())
    else:
        r = httpx.get(
            get_settings().power_url,
            params={
                "parameters": "ALLSKY_SFC_SW_DWN,T2M",
                "community": "AG",  # AG community returns radiation in MJ/m²/day
                "latitude": round(lat, 4), "longitude": round(lon, 4),
                "start": year, "end": year, "format": "JSON",
            },
            timeout=60,
        )
        if r.status_code != 200:
            raise PowerError(f"NASA POWER request failed ({r.status_code}): {r.text[:200]}")
        raw = r.json()["properties"]["parameter"]
        if _complete(raw):
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(raw))

    def parse(series: dict) -> dict[int, float]:
        out = {}
        for k, v in series.items():
            m = int(k[4:])
            if 1 <= m <= 12 and v is not None and v != FILL:
                out[m] = float(v)
        return out

    return {"sol": parse(raw["ALLSKY_SFC_SW_DWN"]), "t2m": parse(raw["T2M"])}


def _complete(raw: dict) -> bool:
    return all(
        sum(1 for k, v in raw[p].items() if 1 <= int(k[4:]) <= 12 and v != FILL) == 12
        for p in ("ALLSKY_SFC_SW_DWN", "T2M")
    )


def climate_for_month(lat: float, lon: float, year: int, month: int, cache_dir: Path) -> dict:
    """Solar radiation and temperature for a month, plus T_opt (warmest month of the year).

    Falls back to the mean of the previous 5 years when the month is not yet published.
    """
    notes: list[str] = []
    try:
        data = fetch_year(lat, lon, year, cache_dir)
    except PowerError:
        data = {"sol": {}, "t2m": {}}

    if month in data["sol"] and month in data["t2m"] and len(data["t2m"]) == 12:
        sol, t_mean, t_opt = data["sol"][month], data["t2m"][month], max(data["t2m"].values())
    else:
        years = [fetch_year(lat, lon, y, cache_dir) for y in range(year - 5, year)]
        years = [y for y in years if month in y["sol"] and len(y["t2m"]) == 12]
        if not years:
            raise PowerError("No NASA POWER climate data available for this location")
        sol = sum(y["sol"][month] for y in years) / len(years)
        t_mean = sum(y["t2m"][month] for y in years) / len(years)
        t_opt = sum(max(y["t2m"].values()) for y in years) / len(years)
        notes.append("climate_fallback")
        log.info("NASA POWER: %s-%02d not available, using %d-year climatology",
                 year, month, len(years))
    return {"sol_daily_mj": sol, "t_mean": t_mean, "t_opt": t_opt, "notes": notes}
