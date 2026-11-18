"""Milestone 86 (experiments/optimizer_replay): float32 weights, replay of committed state, and the detection rules."""
import importlib.util
import os
import sys

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "optimizer_replay")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("orp_run", "run.py")
A = _load("orp_analyze", "analyze.py")


@pytest.mark.parametrize("kind", ["sgd", "momentum", "adam"])
def test_worker_weights_stay_float32(kind):
    w = np.ones(4, np.float32)
    st = R.zero_state(kind, w)
    g = np.array([0.1, -0.2, 0.3, 0.0], np.float32)
    w2, st2 = R.opt_step(kind, w, st, g, np.float64(0.05), 0)  # a float64 lr must not promote the weights
    assert w2.dtype == np.float32


def test_sgd_f64_diagnostic_keeps_float64(monkeypatch):
    monkeypatch.setattr(R, "SGD_F64", True)
    w2, _ = R.opt_step("sgd", np.ones(2, np.float32), (), np.ones(2, np.float32), 0.1, 0)
    assert w2.dtype == np.float64


def test_job_shapes_and_full_stall_far_above_honest():
    name, sched, seed, out = R.job(("momentum", "cosine", 0))
    for mode in R.MODES:
        for key in ["honest"] + [f"skip{q}" for q in R.SKIPS]:
            assert len(out[mode]["w"][key]) == R.N and len(out[mode]["m"][key]) == R.N
    hon, stall = np.array(out["fp16"]["w"]["honest"]), np.array(out["fp16"]["w"]["skip20"])
    assert np.median(stall) > 50 * np.median(hon)
    assert np.median(out["reorder"]["w"]["honest"]) < 1e-3


def test_analyze_rules_on_synthetic_results():
    seeds_t, seeds_c = [0, 1], [100, 101]
    def cell(h, c):
        return {"w": {"honest": [h] * 3, "skip20": [c] * 3}, "m": {"honest": [h] * 3, "skip20": [c] * 3}}
    runs = {str(s): {"fp16": cell(0.1 + 0.01 * (s >= 100), 5.0), "reorder": cell(1e-5, 1.0)} for s in seeds_t + seeds_c}
    res = {"test_seeds": seeds_t, "cal_seeds": seeds_c, "skips": [20], "runs": {"momentum": {"cosine": runs}}}
    out = A.analyze(res)["momentum"]["cosine"]
    assert out["fp16_thr"] == pytest.approx(0.11)
    assert out["honest"]["d"] == 0.0 and out["skip20"]["d"] == 1.0 and out["skip20"]["d_wm"] == 1.0
