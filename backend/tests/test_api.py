import io
import json
import time
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[-9.30, 38.70], [-9.28, 38.70], [-9.28, 38.72], [-9.30, 38.72],
                     [-9.30, 38.70]]],
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def wait_done(client, run_id, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/api/runs/{run_id}").json()
        if r["status"] in ("done", "failed"):
            return r
        time.sleep(0.5)
    raise AssertionError("run did not finish")


def test_config(client):
    c = client.get("/api/config").json()
    assert c["password_required"] is False
    assert "npp" in c["steps"]


def test_seeded_reference_run(client):
    regions = client.get("/api/regions").json()
    assert regions[0]["name"] == "Oeiras" and regions[0]["reference"]
    runs = client.get("/api/runs", params={"region_id": regions[0]["id"]}).json()
    run = wait_done(client, runs[-1]["id"])
    assert run["status"] == "done", run["error"]
    res = run["result"]
    assert res["offset_pct"] == pytest.approx(13.18, abs=0.4)
    assert set(res["layers"]) >= {"ndvi", "fpar", "npp", "co2", "landcover"}
    assert all(s["status"] == "done" for s in run["steps"].values())

    assert client.get(f"/api/runs/{run['id']}/layers/npp.png").status_code == 200
    for fmt in ("csv", "pdf", "zip"):
        r = client.get(f"/api/runs/{run['id']}/export.{fmt}", params={"lang": "pt"})
        assert r.status_code == 200, fmt
    z = zipfile.ZipFile(io.BytesIO(client.get(f"/api/runs/{run['id']}/export.zip").content))
    assert "npp.tif" in z.namelist()

    ts = client.get(f"/api/regions/{regions[0]['id']}/timeseries",
                    params={"method": "legacy"}).json()
    assert ts[0]["month"] == 6


def test_region_crud_and_validation(client):
    r = client.post("/api/regions", json={"name": "Test", "geometry": SQUARE, "population": 10})
    assert r.status_code == 200
    rid = r.json()["id"]
    assert 3 < r.json()["area_km2"] < 4

    line = {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}
    assert client.post("/api/regions", json={"name": "x", "geometry": line}).status_code == 422
    big = {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}
    r = client.post("/api/regions", json={"name": "x", "geometry": big})
    assert r.json()["detail"] == "geometry_too_large"

    up = client.post("/api/regions/parse",
                     files={"file": ("a.geojson", json.dumps(SQUARE), "application/json")})
    assert up.status_code == 200 and up.json()["area_km2"] > 3

    # Legacy method is only allowed for the reference region
    r = client.post("/api/runs", json={"region_id": rid, "year": 2024, "months": [6],
                                       "method": "legacy"})
    assert r.status_code == 422
    r = client.post("/api/runs", json={"region_id": rid, "year": 2099, "months": [6]})
    assert r.status_code == 422
    assert client.delete(f"/api/regions/{rid}").status_code == 200


def test_password(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_password", "secret")
    body = {"name": "P", "geometry": SQUARE}
    assert client.post("/api/regions", json=body).status_code == 401
    r = client.post("/api/regions", json=body, headers={"X-Demo-Password": "secret"})
    assert r.status_code == 200
    assert client.get("/api/regions").status_code == 200
