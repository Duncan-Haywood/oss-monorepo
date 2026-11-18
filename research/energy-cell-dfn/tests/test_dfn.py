import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(HERE))
pytest.importorskip("scipy")
spec = importlib.util.spec_from_file_location("dfn_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_spearman_known_values():
    assert run.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == pytest.approx(1.0)
    assert run.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)


def test_selection_is_committed_unique_and_in_bounds():
    from energy_cell import BOUNDS
    sel = json.loads((HERE / "selected.json").read_text())
    assert sel[0]["source"] == "baseline" and len(sel) > 40
    keys = {tuple(np.round(s["x"], 6)) for s in sel}
    assert len(keys) == len(sel)
    for s in sel:
        x = np.array(s["x"])
        assert np.all(x >= BOUNDS[:, 0]) and np.all(x <= BOUNDS[:, 1])


def test_select_reproduces_committed_selection(tmp_path, monkeypatch):
    before = (HERE / "selected.json").read_text()
    monkeypatch.setattr(run, "HERE", tmp_path)
    run.select()
    assert json.loads((tmp_path / "selected.json").read_text()) == json.loads(before)


def test_spme_baseline_matches_energy_cell_figure():
    pytest.importorskip("pybamm")
    from energy_cell import BASELINE
    r = run.evaluate_with(BASELINE, "SPMe", cycles=100)
    assert r["score"] == pytest.approx(109.1, abs=0.2)  # energy-cell README: 109 Wh/kg


def test_failure_result_keeps_zero_score_and_names_the_cause():
    r = run.failure("solver_error", "SolverError: x", 3)
    assert r["score"] == 0.0 and r["wh_kg_bol"] == 0.0
    assert r["failure"] == "solver_error" and r["cycles_done"] == 3


def _d6():
    rows = json.loads((HERE / "diagnose6.json").read_text())
    return {(r["design"], r["model"], r["cond"], r["k"]): r for r in rows}


def test_diagnose6_cases_cover_both_models_and_designs():
    import diagnose6
    keys = {(c["design"], c["model"], c["cond"], c["k"]) for c in diagnose6.cases()}
    assert keys == set(_d6())
    assert {k[1] for k in keys} == {"SPMe", "DFN"} and {k[0] for k in keys} == {"bayes3", "random1"}


def test_diagnose6_doubling_diffusivity_removes_spme_collapse():
    """The recorded run: SPMe's negative concentration and cycle-2 collapse at D_e x1 are gone at x2,
    where SPMe's cycle-2 charge lands within 3% of DFN's."""
    d = _d6()
    for design in ("bayes3", "random1"):
        base = d[(design, "SPMe", "default", 1.0)]["steps"]
        assert min(s["ce_min"] for s in base) < 0 and base[-1]["ah"] < 1.0
        spme2 = d[(design, "SPMe", "default", 2.0)]["steps"]
        dfn2 = d[(design, "DFN", "default", 2.0)]["steps"]
        assert min(s["ce_min"] for s in spme2) > 0
        assert abs(spme2[-1]["ah"] - dfn2[-1]["ah"]) / dfn2[-1]["ah"] < 0.03


def _val():
    return json.loads((HERE / "validate_data.json").read_text())


def test_crossing_time_interpolates_and_handles_no_crossing():
    import validate_data as v
    t, volt = np.array([0.0, 10.0, 20.0]), np.array([4.0, 3.5, 3.0])
    assert v.crossing_time(t, volt, 3.25) == pytest.approx(15.0)
    assert v.crossing_time(t, volt, 2.9) is None
    assert v.rmse([1, 2], [1, 4]) == pytest.approx(np.sqrt(2))


def test_validate_data_covers_every_case_and_model():
    import validate_data as v
    rows = _val()
    seen = {(r["cell"], r["crate"]) for r in rows}
    assert seen == {(c[0], c[2]) for c in v.CASES}
    for r in rows:
        for m in v.MODELS:
            assert r[m]["covered"] > 0.95 and r[m]["rmse_mV"] > 0


def test_low_rate_models_agree_far_closer_than_they_match_data():
    """H2 (LOG.md): at the lowest rate the SPMe-DFN difference is far below either model's error."""
    for r in _val():
        if (r["cell"], r["crate"]) in (("Ecker", 1.0), ("Ai", 0.1)):
            assert r["SPMe_vs_DFN_rmse_mV"] < 1.0
            assert r["SPMe_vs_DFN_rmse_mV"] < 0.1 * min(r["SPMe"]["rmse_mV"], r["DFN"]["rmse_mV"])


def test_ai_2c_dfn_fits_measured_curve_better_than_spme():
    """H1 holds on the Ai cell: at 2C (isothermal, every mesh) DFN's RMSE is under half of SPMe's."""
    rows = [r for r in _val() if r["cell"] == "Ai" and r["crate"] == 2.0 and not r["thermal"]]
    assert rows
    for r in rows:
        assert r["DFN"]["rmse_mV"] < 0.5 * r["SPMe"]["rmse_mV"]


def test_ecker_5c_spme_not_worse_than_dfn():
    """H1 fails on the Ecker cell: at 5C SPMe is within 5 mV of DFN or better on every mesh and thermal option."""
    rows = [r for r in _val() if r["cell"] == "Ecker" and r["crate"] == 5.0]
    assert len(rows) >= 3
    for r in rows:
        assert r["SPMe"]["rmse_mV"] <= r["DFN"]["rmse_mV"] + 5.0
