from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"), extra="ignore"
    )

    data_dir: Path = BACKEND_DIR / "data"
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"
    fixtures_dir: Path = BACKEND_DIR / "tests" / "fixtures" / "oeiras"

    # Copernicus Data Space Ecosystem (openEO)
    openeo_url: str = "https://openeo.dataspace.copernicus.eu"
    cdse_client_id: str = ""
    cdse_client_secret: str = ""
    # Stop waiting for a Copernicus batch job after this many minutes (queue + processing)
    openeo_timeout_min: int = 60

    # NASA POWER (solar radiation + air temperature)
    power_url: str = "https://power.larc.nasa.gov/api/temporal/monthly/point"

    # Demo protection: when set, write operations require this password
    demo_password: str = ""

    max_region_km2: float = 1000.0
    max_months_per_job: int = 12
    seed_oeiras: bool = True

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'app.db'}"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def runs_dir(self) -> Path:
        return self.data_dir / "runs"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    for d in (s.data_dir, s.cache_dir, s.runs_dir):
        d.mkdir(parents=True, exist_ok=True)
    return s
