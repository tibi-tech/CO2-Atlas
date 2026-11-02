from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel, create_engine

from app.core.config import get_settings


def now() -> datetime:
    return datetime.now(UTC)


class Region(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    geometry: dict = Field(sa_column=Column(JSON))
    area_km2: float
    population: int | None = None
    emissions_per_capita: float | None = None  # t CO2 / person / month
    reference: bool = False  # bundled Oeiras thesis region
    created_at: datetime = Field(default_factory=now)


class Run(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    region_id: int = Field(foreign_key="region.id", index=True)
    year: int
    month: int
    method: str = "improved"
    status: str = "queued"  # queued | running | done | failed
    params: dict = Field(default_factory=dict, sa_column=Column(JSON))
    steps: dict = Field(default_factory=dict, sa_column=Column(JSON))
    result: dict | None = Field(default=None, sa_column=Column(JSON))
    error: str | None = None
    created_at: datetime = Field(default_factory=now)
    started_at: datetime | None = None
    finished_at: datetime | None = None


engine = create_engine(get_settings().db_url, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
