"""Regression: the rebuilt thesis method must reproduce the original Oeiras June 2024 report."""

import pytest

from app.core.config import get_settings
from app.pipeline.legacy import legacy_analysis

# From the original RELATORIO_NPP.txt (tests/fixtures/oeiras/report_reference.txt)
THESIS_CO2_T = 20228.16
THESIS_OFFSET_PCT = 13.18
EMISSIONS = 172120 * 0.8917


def test_thesis_result_reproduced():
    r = legacy_analysis(get_settings().fixtures_dir, 2024, 6, EMISSIONS)
    # Small differences come from proper georeferenced resampling instead of image stretching
    assert r["absorbed_co2_t"] == pytest.approx(THESIS_CO2_T, rel=0.03)
    assert r["offset_pct"] == pytest.approx(THESIS_OFFSET_PCT, abs=0.4)
    assert r["emissions_co2_t"] == pytest.approx(153479.40, rel=1e-6)
