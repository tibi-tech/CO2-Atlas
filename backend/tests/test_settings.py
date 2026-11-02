import json
import stat

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.services import credentials


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(credentials, "verify", fake_verify)
    credentials.delete()
    with TestClient(app) as c:
        yield c
    credentials.delete()


def fake_verify(client_id: str, client_secret: str) -> None:
    if client_secret != "good-secret":
        raise ValueError("copernicus_auth_failed")


def test_save_is_write_only(client):
    assert client.get("/api/settings").json()["copernicus"]["configured"] is False

    r = client.put("/api/settings/copernicus",
                   json={"client_id": "sh-1234567890abcdef", "client_secret": "good-secret"})
    assert r.status_code == 200
    body = r.json()
    assert body["copernicus"] == {"configured": True, "source": "settings",
                                  "client_id_hint": "sh-1234…cdef", "env_managed": False}
    assert "good-secret" not in r.text
    assert "good-secret" not in client.get("/api/settings").text
    assert client.get("/api/config").json()["copernicus_configured"] is True

    f = get_settings().data_dir / "credentials.json"
    assert stat.S_IMODE(f.stat().st_mode) == 0o600
    assert json.loads(f.read_text())["client_secret"] == "good-secret"

    assert client.post("/api/settings/copernicus/test").json() == {"ok": True}
    assert client.delete("/api/settings/copernicus").json()["copernicus"]["configured"] is False
    assert not f.exists()


def test_invalid_credentials_not_saved(client):
    r = client.put("/api/settings/copernicus",
                   json={"client_id": "sh-xxxx", "client_secret": "bad-secret"})
    assert r.status_code == 422 and r.json()["detail"] == "copernicus_auth_failed"
    assert credentials.get() is None


def test_env_takes_priority(client, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "cdse_client_id", "sh-env-client-id-0000")
    monkeypatch.setattr(s, "cdse_client_secret", "env-secret")
    st = client.get("/api/settings").json()["copernicus"]
    assert st["source"] == "env" and st["env_managed"] is True
    r = client.put("/api/settings/copernicus",
                   json={"client_id": "sh-xxxx", "client_secret": "good-secret"})
    assert r.status_code == 409


def test_password_required_when_set(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_password", "secret")
    body = {"client_id": "sh-xxxx", "client_secret": "good-secret"}
    assert client.put("/api/settings/copernicus", json=body).status_code == 401
    r = client.put("/api/settings/copernicus", json=body, headers={"X-Demo-Password": "secret"})
    assert r.status_code == 200


def test_remote_blocked_without_password(monkeypatch):
    monkeypatch.setattr(credentials, "verify", fake_verify)
    with TestClient(app, client=("203.0.113.9", 5000)) as c:
        assert c.get("/api/settings").json()["editable"] is False
        r = c.put("/api/settings/copernicus",
                  json={"client_id": "sh-xxxx", "client_secret": "good-secret"})
        assert r.status_code == 403 and r.json()["detail"] == "settings_local_only"
