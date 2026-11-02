"""Command line helpers.

    python -m app.cli login      # one-time Copernicus device login (stores a refresh token)
    python -m app.cli legacy     # print the thesis-method result for Oeiras (June 2024)
"""

import sys

from app.core.config import get_settings


def login() -> None:
    import openeo

    conn = openeo.connect(get_settings().openeo_url)
    conn.authenticate_oidc_device(store_refresh_token=True)
    print("Logged in; refresh token stored for the worker.")


def legacy() -> None:
    from app.pipeline.legacy import legacy_analysis

    r = legacy_analysis(get_settings().fixtures_dir, 2024, 6, 172120 * 0.8917)
    for k, v in r.items():
        if k != "by_landcover":
            print(f"{k:24s} {v}")


if __name__ == "__main__":
    {"login": login, "legacy": legacy}.get(sys.argv[1] if len(sys.argv) > 1 else "",
                                           lambda: print(__doc__))()
