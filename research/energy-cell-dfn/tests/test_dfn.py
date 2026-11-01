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
