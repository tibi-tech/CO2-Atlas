"""Copernicus credentials: from the environment (.env) or saved through the settings page.

The secret is write-only: it is stored server-side (data dir, mode 600) and never returned
by the API or written to logs.
"""

import json
import logging
import os
import threading
from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings

log = logging.getLogger(__name__)
_lock = threading.Lock()

Source = Literal["env", "settings"]


@dataclass(frozen=True)
class Credentials:
    client_id: str
    client_secret: str
    source: Source

    @property
    def hint(self) -> str:
        cid = self.client_id
        return cid if len(cid) <= 12 else f"{cid[:7]}…{cid[-4:]}"


def _path():
    return get_settings().data_dir / "credentials.json"


def get() -> Credentials | None:
    s = get_settings()
    if s.cdse_client_id and s.cdse_client_secret:
        return Credentials(s.cdse_client_id, s.cdse_client_secret, "env")
    p = _path()
    if p.exists():
        try:
            d = json.loads(p.read_text())
            if d.get("client_id") and d.get("client_secret"):
                return Credentials(d["client_id"], d["client_secret"], "settings")
        except (OSError, ValueError):
            log.warning("Could not read stored Copernicus credentials")
    return None


def save(client_id: str, client_secret: str) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    with _lock:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"client_id": client_id, "client_secret": client_secret}, f)
        os.chmod(tmp, 0o600)
        tmp.replace(p)


def delete() -> None:
    with _lock:
        _path().unlink(missing_ok=True)


def env_managed() -> bool:
    s = get_settings()
    return bool(s.cdse_client_id and s.cdse_client_secret)


def verify(client_id: str, client_secret: str) -> None:
    """Raises ValueError if Copernicus openEO rejects the client credentials."""
    import openeo

    try:
        conn = openeo.connect(get_settings().openeo_url)
        conn.authenticate_oidc_client_credentials(client_id=client_id,
                                                  client_secret=client_secret)
        conn.describe_account()
    except Exception as e:  # noqa: BLE001
        # Never include the secret; openEO errors do not contain it.
        log.info("Copernicus credential check failed: %s", type(e).__name__)
        raise ValueError("copernicus_auth_failed") from e
