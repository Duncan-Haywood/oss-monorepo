"""Milestone 85 (experiments/optimizer_harm_model): optimiser steps, stall semantics and the analysis helpers."""
import importlib.util
import json
import os
import sys

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "optimizer_harm_model")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("ohm_run", "run.py")
A = _load("ohm_analyze", "analyze.py")


def test_momentum_ema_step_matches_hand_computation():
    w, g = np.ones(3, np.float32), np.array([1.0, -2.0, 0.5], np.float32)
    st = R.zero_state("momentum", w)
    w1, st1, u = R.step("momentum", w, st, g, 0.5, 0)
    assert np.allclose(st1[0], 0.1 * g)
    assert np.allclose(w1, 1 - 0.5 * 0.1 * g)
    # with a constant gradient the EMA buffer tends to g, so the effective step tends to lr * g
    for t in range(1, 200):
        w1, st1, u = R.step("momentum", w1, st1, g, 0.5, t)
    assert np.allclose(st1[0], g, atol=1e-6)


def test_adam_first_step_is_sign_times_lr():
    w, g = np.zeros(3, np.float32), np.array([3.0, -0.01, 2.0], np.float32)
    w1, _, u = R.step("adam", w, R.zero_state("adam", w), g, 0.1, 0)
    assert np.allclose(u, np.sign(g), atol=1e-4)  # bias-corrected m / sqrt(v) = g / |g| at step one
    assert np.allclose(w1, -0.1 * np.sign(g), atol=1e-5)


def test_schedules_sum_to_their_totals():
    for name in R.TEST_SCHEDULES + (R.CAL_SCHEDULE,):
        assert R.lrs_for("momentum", name).sum() == pytest.approx(150.0, rel=1e-6)
        assert R.lrs_for("adam", name, 6.0).sum() == pytest.approx(6.0, rel=1e-6)


def test_stall_restarts_from_frozen_state():
    # a stall of segment j must equal training with that segment's steps skipped, weights and moments frozen
    lrs, batches = R.lrs_for("adam", "cosine", 6.0), R.m82.batches_for(0)
    w0 = R.init(np.random.default_rng(0))
    st0 = R.zero_state("adam", w0)
    end, cps, eff = R.run_from("adam", w0, st0, 0, lrs, batches, keep=True)
    assert len(cps) == R.N and eff.shape == (R.N,) and (eff > 0).all()
    j = R.N - 2
    w, st = cps[j]
    a = R.run_from("adam", w, st, j * R.S + R.S, lrs, batches)[0]
    xtr, ytr = R.DATA[0], R.DATA[1]
    b = (w, st)
    for t in range(j * R.S + R.S, R.T):
        b = R.step("adam", b[0], b[1], R.grad(b[0], xtr[batches[t]], ytr[batches[t]]), float(lrs[t]), t)[:2]
    assert np.array_equal(a, b[0])


def test_game_a_exact_model_matches_oracle():
    seg = np.linspace(3.0, 0.2, 40)
    g = A.game_a(2e-4 * seg, 7.0 * seg, 5)
    assert g["model"] == pytest.approx(g["oracle"], rel=1e-9)
    assert g["gain_model"] > 1


@pytest.mark.skipif(not os.path.exists(os.path.join(EXP, "summary.json")), reason="run analyze.py first")
def test_committed_summary_is_consistent():
    s = json.load(open(os.path.join(EXP, "summary.json")))
    assert s["adam_total"] == 6.0
    for o in ("momentum", "adam"):
        for sc in R.TEST_SCHEDULES:
            row = s["opts"][o][sc]
            assert len(row["harm"]) == R.N
            assert sum(row["seg_lr"]) == pytest.approx(150.0 if o == "momentum" else 6.0, rel=1e-4)
