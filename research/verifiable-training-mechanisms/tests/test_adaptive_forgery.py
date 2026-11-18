"""Milestone 87 (experiments/adaptive_forgery): zero-gradient forgeries of the committed state and the detection rules."""
import importlib.util
import os
import sys

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "adaptive_forgery")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("afg_run", "run.py")
A = _load("afg_analyze", "analyze.py")


def _states(kind, n=25):
    rng = np.random.default_rng(0)
    w = rng.normal(size=6).astype(np.float32)
    st = R.m86.zero_state(kind, w)
    states, gs = [(w, st)], []
    for t in range(n):
        g = rng.normal(size=6).astype(np.float32)
        w, st = R.m86.opt_step(kind, w, st, g, 0.01, t)
        states.append((w, st))
        gs.append(g)
    return states, gs


def test_skip_commits_truncated_state():
    states, _ = _states("adam")
    w, st = R.forged("adam", "skip", states, None, np.full(25, 0.01), 0, 3)
    assert np.array_equal(w, states[17][0]) and np.array_equal(st[1], states[17][1][1])


def test_coast_keeps_first_moment_and_moves_weights():
    states, _ = _states("momentum")
    w, st = R.forged("momentum", "coast", states, None, np.full(25, 0.01), 0, 2)
    np.testing.assert_allclose(st[0], states[18][1][0], rtol=1e-5)
    np.testing.assert_allclose(w, states[18][0] - 0.02 * states[18][1][0], rtol=1e-5, atol=1e-7)


def test_stale_reapplies_last_gradient(monkeypatch):
    states, gs = _states("sgd")
    monkeypatch.setattr(R.m86, "mode_grad", lambda mode, w, x, y, rng: gs[17])
    data = (np.zeros((25, 1)), np.zeros(25))
    monkeypatch.setattr(R, "DATA", data)
    w, _ = R.forged("sgd", "stale", states, list(range(25)), np.full(25, 0.01), 0, 2)
    np.testing.assert_allclose(w, states[18][0] - 0.02 * gs[17], rtol=1e-5, atol=1e-7)


def test_cheats_per_optimiser():
    assert R.cheats("sgd") == ["skip", "stale"] and "coast" in R.cheats("adam")


def test_analyze_rules_on_synthetic_results():
    keys = ["honest", "coast1", "skip1"]

    def seg(h, c):
        return {"honest": [h] * 5, "coast1": [c] * 5, "skip1": [c] * 5}
    run = {"fp16": {"w": seg(1.0, 0.5), "m": seg(1.0, 5.0)}, "reorder": {"w": seg(1e-3, 1.0), "m": seg(1e-3, 1.0)}}
    cal = {"fp16": {"w": seg(1.0, 1.0), "m": seg(1.0, 1.0)}, "reorder": {"w": seg(1e-3, 1.0), "m": seg(1e-3, 1.0)}}
    res = {"test_seeds": [0], "cal_seeds": [1], "skips": [1],
           "runs": {"x": {"cosine": {"0": run, "1": cal}}}}
    c = A.analyze(res)["x"]["cosine"]["cells"]
    assert c["honest"]["flag_WM"] == 0.0 and c["coast1"]["flag_W"] == 0.0
    assert c["coast1"]["d_WM_aWM"] == 1.0 and c["coast1"]["d_WM_aW"] == 1.0
    assert keys == list(c)
    assert A.analyze(res)["x"]["cosine"]["coast_m_max_rel_diff"] == 0.0
