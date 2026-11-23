"""Milestone 92 (experiments/compensated_arbiter): Kahan-compensated SGD and the compensated-weights arbiter statistic."""
import importlib.util
import os

import pytest

np = pytest.importorskip("numpy")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "compensated_arbiter")


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


A = _load("ca_analyze", "analyze.py")


def kahan_step(w, c, g, lr):
    # copy of run.py's step, so this test needs neither scikit-learn nor the digits data
    y = (np.float32(-lr) * g - c).astype(np.float32)
    t = (w + y).astype(np.float32)
    return t, ((t - w) - y).astype(np.float32)


def test_run_py_step_matches_the_copy_here():
    src = open(os.path.join(EXP, "run.py")).read()
    assert "y = (np.float32(-lr) * g - c).astype(np.float32)" in src
    assert "c2 = ((t - w) - y).astype(np.float32)" in src


def test_compensated_weights_keep_updates_below_one_ulp():
    rng = np.random.default_rng(0)
    w0 = np.full(1000, 1.0, dtype=np.float32)
    g = rng.normal(size=1000).astype(np.float32)
    lr = 1e-9  # lr x |g| far below half an ulp of 1.0 (6e-8): plain float32 SGD drops every update
    w, c, plain = w0.copy(), np.zeros_like(w0), w0.copy()
    for _ in range(200):
        w, c = kahan_step(w, c, g, lr)
        plain = (plain - np.float32(lr) * g).astype(np.float32)
    exact = w0.astype(np.float64) - 200 * lr * g.astype(np.float64)
    assert np.array_equal(plain, w0)  # the rounding floor: nothing moved
    err = np.abs((w.astype(np.float64) - c.astype(np.float64)) - exact)
    assert err.max() < 1e-12  # the compensated weights track the exact sum


def test_rule_is_milestone_91s_selected_one():
    cal = np.full((80, 10), 1e-6)
    cal[0, 0] = 1.0  # one outlier does not move a 0.95 quantile of 400 values
    thr = A.rule_threshold(cal)
    assert thr[0] == pytest.approx(1e-5) and A.RULE == "Q(0.95,10,C80)"
