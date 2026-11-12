import importlib.util
import json
import random
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "calibrate"
spec = importlib.util.spec_from_file_location("calibrate_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_choose_set_follows_the_registered_rule():
    p = {"Mohtat2020": {"SPMe": {"ok": True, "r_min": 0.6}, "DFN": {"ok": True}},
         "NCA_Kim2011": {"SPMe": {"ok": False, "r_min": 0.2}, "DFN": {"ok": True}},
         "Prada2013": {"SPMe": {"ok": True, "r_min": 0.3}, "DFN": {"ok": True}}}
    assert run.choose_set(p) == "Prada2013"
    p["Prada2013"]["SPMe"]["r_min"] = 0.01
    assert run.choose_set(p) == "Mohtat2020"   # none in range: first that runs
    assert run.choose_set({}) is None


def test_cutoff_largest_breaks_ties_upwards():
    r = [0.0, 0.1, 0.5]
    bad = [True, False, False]
    # thresholds 0.00 to 0.09 all classify perfectly; the largest is taken
    assert run.cutoff_largest(r, bad, run.GRID) == pytest.approx(0.09)


def test_fixed_counts_recall_and_calls():
    rec, calls = run.fixed([0.0, 0.05, 0.2, 0.4], [True, False, True, False], 0.07)
    assert rec == pytest.approx(0.5) and calls == 2


def test_bottom_up_stops_after_s_trusted():
    r = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]
    bad = [True, False, True, False, False, True]
    rec, calls, v = run.bottom_up(r, bad, 2)
    assert calls == 5 and rec == pytest.approx(2 / 3)
    rec, calls, v = run.bottom_up(r, bad, 1)
    assert calls == 2 and v[:2] == [True, True]


def test_calibrated_verifies_its_sample_and_flags_rest():
    r = [i / 10 for i in range(10)]
    bad = [i < 3 for i in range(10)]
    rec, calls, t = run.calibrated(r, bad, 10, random.Random(0))
    assert rec == 1.0 and calls == 10   # the whole pool is the sample
    rec, calls, t = run.calibrated(r, bad, 4, random.Random(1))
    assert 0 <= rec <= 1 and 4 <= calls <= 10


def test_committed_summary_matches_its_registered_rules():
    p = HERE / "summary.json"
    if not p.exists():
        pytest.skip("report not run")
    s = json.loads(p.read_text())
    assert s["x_set"] in run.CANDIDATES
    for e in s["sets"].values():
        assert set(e["B"]) == {str(k) for k in run.SS} and set(e["C"]) == {str(k) for k in run.KS}
        assert 0 <= e["auc"] <= 1
