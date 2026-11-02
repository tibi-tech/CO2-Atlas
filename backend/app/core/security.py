import hmac

from fastapi import Header, HTTPException, Request

from app.core.config import get_settings

LOOPBACK = {"127.0.0.1", "::1", "localhost", "testclient"}


def require_password(x_demo_password: str | None = Header(default=None)) -> None:
    """Protects write operations when DEMO_PASSWORD is configured."""
    expected = get_settings().demo_password
    if not expected:
        return
    if not x_demo_password or not hmac.compare_digest(x_demo_password, expected):
        raise HTTPException(status_code=401, detail="invalid_password")


def require_admin(request: Request, x_demo_password: str | None = Header(default=None)) -> None:
    """Server settings: needs DEMO_PASSWORD when set, otherwise only from this machine."""
    if get_settings().demo_password:
        require_password(x_demo_password)
        return
    host = request.client.host if request.client else ""
    if host not in LOOPBACK:
        raise HTTPException(status_code=403, detail="settings_local_only")


def is_admin_allowed(request: Request) -> bool:
    if get_settings().demo_password:
        return True  # allowed once the password is provided
    return (request.client.host if request.client else "") in LOOPBACK
