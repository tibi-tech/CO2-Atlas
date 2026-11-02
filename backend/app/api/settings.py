import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.core.security import is_admin_allowed, require_admin
from app.services import credentials

router = APIRouter(prefix="/api/settings", tags=["settings"])


class CopernicusIn(BaseModel):
    client_id: str = Field(min_length=4, max_length=200)
    client_secret: str = Field(min_length=4, max_length=500)


def _status(request: Request) -> dict:
    c = credentials.get()
    return {
        "copernicus": {
            "configured": c is not None,
            "source": c.source if c else None,
            "client_id_hint": c.hint if c else None,
            "env_managed": credentials.env_managed(),
        },
        "editable": is_admin_allowed(request),
    }


@router.get("")
def get_settings_status(request: Request):
    return _status(request)


@router.put("/copernicus", dependencies=[Depends(require_admin)])
async def save_copernicus(body: CopernicusIn, request: Request):
    if credentials.env_managed():
        raise HTTPException(409, "copernicus_env_managed")
    cid, secret = body.client_id.strip(), body.client_secret.strip()
    try:
        await run_in_threadpool(credentials.verify, cid, secret)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    credentials.save(cid, secret)
    return _status(request)


@router.delete("/copernicus", dependencies=[Depends(require_admin)])
def delete_copernicus(request: Request):
    if credentials.env_managed():
        raise HTTPException(409, "copernicus_env_managed")
    credentials.delete()
    return _status(request)


_usage_cache: dict = {}


def _usage() -> dict:
    from app.pipeline.sources.copernicus import connect

    conn = connect()
    month = datetime.now(UTC).strftime("%Y-%m")
    jobs = [j for j in conn.list_jobs() if str(j.get("created", "")).startswith(month)]
    credits = 0.0
    for j in jobs:
        cost = j.get("costs")
        if cost is None and j.get("status") in ("finished", "error", "canceled"):
            # The job list omits costs; the job detail has them
            cost = conn.job(j["id"]).describe().get("costs")
        credits += float(cost or 0)
    return {"month": month, "jobs": len(jobs), "credits": round(credits, 1)}


@router.get("/copernicus/usage")
async def copernicus_usage():
    if credentials.get() is None:
        raise HTTPException(409, "copernicus_not_configured")
    cached = _usage_cache.get("v")
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    try:
        data = await run_in_threadpool(_usage)
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "copernicus_usage_failed") from None
    _usage_cache["v"] = (time.monotonic(), data)
    return data


@router.post("/copernicus/test", dependencies=[Depends(require_admin)])
async def test_copernicus():
    c = credentials.get()
    if c is None:
        raise HTTPException(409, "copernicus_not_configured")
    try:
        await run_in_threadpool(credentials.verify, c.client_id, c.client_secret)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    return {"ok": True}
