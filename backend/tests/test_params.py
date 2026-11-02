import numpy as np
import pytest

from app.pipeline import analysis
from app.pipeline.npp import C_TO_CO2, npp
from app.pipeline.params import climate, landcover, vegetation


def test_ndvi_handles_zero_division():
    out = vegetation.ndvi(np.array([0, 1000.0]), np.array([0, 3000.0]))
    assert np.isnan(out[0])
    assert out[1] == pytest.approx(0.5)


def test_fpar_fixed_range_is_clipped():
    out = vegetation.fpar(np.array([-0.5, 0.023, 0.70, 1.0, np.nan]))
    assert out[0] == pytest.approx(vegetation.FPAR_MIN)
    assert out[1] == pytest.approx(vegetation.FPAR_MIN)
    assert out[2] == pytest.approx(vegetation.FPAR_MAX)
    assert out[3] == pytest.approx(vegetation.FPAR_MAX)
    assert np.isnan(out[4])


def test_fpar_scene_range():
    out = vegetation.fpar(np.array([0.2, 0.4]), None, None)
    assert out.tolist() == pytest.approx([vegetation.FPAR_MIN, vegetation.FPAR_MAX])


def test_wsc_bounds():
    # 3 pixels: wettest -> 1.0, driest -> 0.5 (scene-normalised)
    b = np.array([500.0, 2000.0, 4000.0])
    out = vegetation.wsc(b, b, robust=False)
    assert out[0] == pytest.approx(1.0)
    assert out[2] == pytest.approx(0.5)
    robust = vegetation.wsc(np.r_[b, 60000.0], np.r_[b, 60000.0])
    assert robust[-1] == pytest.approx(0.5) and robust[0] > 0.95


def test_temperature_factors():
    assert climate.t1(20) == pytest.approx(0.8 + 0.4 - 0.2)
    # T2 is ~1 near the optimum temperature and drops at extremes
    assert float(climate.t2(20, 20)) == pytest.approx(0.9912, abs=1e-3)
    assert float(climate.t2(45, 20)) < 0.5
    assert climate.monthly_sol_mj(10, 2024, 2) == 290


def test_emax_table():
    lc = np.array([10, 50, 80, 30, np.nan])
    out = landcover.emax(lc)
    assert out[:4].tolist() == pytest.approx([1.0, 0.0, 0.0, 1.04])
    assert np.isnan(out[4])


def test_analysis_totals():
    # 4 pixels of 100 m², NPP 100 g C/m² -> 4 * 100 * 100 g = 0.04 t C
    n = npp(sol=np.full((2, 2), 400.0), fpar=0.5, t1=1, t2=1, wsc=1, emax=1)
    lc = np.array([[10, 10], [30, 50]], dtype=np.float32)
    r = analysis.analyse(n, lc, 100, emissions_t_co2=0.04 * C_TO_CO2 * 2)
    assert r["absorbed_c_t"] == pytest.approx(0.04)
    assert r["offset_pct"] == pytest.approx(50)
    assert {c["code"] for c in r["by_landcover"]} == {10, 30, 50}
    assert r["mean_npp_c_kg_ha"] == pytest.approx(1000)
