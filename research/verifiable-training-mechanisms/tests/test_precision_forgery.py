"""Milestone 89 (experiments/precision_forgery): low-precision proxy forgeries and the two-sided referee."""
import importlib.util
import os
import sys

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "precision_forgery")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("prf_run", "run.py")
A = _load("prf_analyze", "analyze.py")


def test_bf16_rounds_to_nearest_even():
    a = np.array([1.0, 1 + 2 ** -8, 1 + 3 * 2 ** -8, 1 + 2 ** -7 + 2 ** -10, -3.0], dtype=np.float32)
    got = R.to_bf16(a)
    assert got.tolist() == [1.0, 1.0, 1 + 2 ** -6, 1 + 2 ** -7, -3.0]  # ties go to the even significand


def _honest(kind, seed=0, steps=20):
    lrs = np.full(steps, 0.01)
    batches = R.m82.batches_for(seed)[:steps]
    w = R.m86.init(np.random.default_rng(seed))
    st = R.m86.zero_state(kind, w)
    states = [(w, st)]
    for t in range(steps):
        b = batches[t]
        w, st = R.m86.opt_step(kind, w, st, R.m86.mode_grad("worker", w, R.DATA[0][b], R.DATA[1][b], None), 0.01, t)
        states.append((w, st))
    return states, batches, lrs


@pytest.mark.parametrize("kind", ["sgd", "momentum", "adam"])
def test_full_f16_forgery_is_the_referee_replay(kind):
    states, batches, lrs = _honest(kind)
    w, st = R.prec_forged(kind, "f16", states, batches, lrs, 0, 20)
    wr, sr = states[0]
    for t in range(20):
        b = batches[t]
        wr, sr = R.m86.opt_step(kind, wr, sr, R.m86.mode_grad("fp16", wr, R.DATA[0][b], R.DATA[1][b], None), 0.01, t)
    assert np.array_equal(w, wr)


def test_f32_precision_is_the_honest_step():
    states, batches, lrs = _honest("momentum")
    w, st = R.prec_forged("momentum", "f32", states, batches, lrs, 0, 5)
    assert np.array_equal(w, states[20][0]) and np.array_equal(st[0], states[20][1][0])


def test_saved_shares():
    assert A.saved_prec(20, 0.5) == 0.5 and A.saved_prec(1, 0.0) == 0.05
    assert abs(A.saved_sub(63, 20) - 1 / 64) < 1e-12


def test_two_sided_referee_flags_a_too_good_match():
    nseg = 10
    keys = ["honest"] + [f"skip{q}" for q in (1, 2, 5)] + ["f16_1", "bf16_1", "sub63_10"]
    cal_v = [0.1] * 5 + [1.0] * 5
    cal = {"fp16": {"w": {k: list(cal_v) for k in keys}}, "reorder": {"w": {k: [1e-3] * nseg for k in keys}}}
    tv = {k: [0.5] * nseg for k in keys}
    tv["honest"] = [0.1] * 5 + [1.0] * 5
    tv["f16_1"] = [0.0] * nseg                       # matches the replay exactly: under every zone's min
    rv = {k: [1.0] * nseg for k in keys}
    rv["honest"] = [1e-3] * nseg
    run = {"fp16": {"w": tv}, "reorder": {"w": rv}}
    res = {"test_seeds": [0], "cal_seeds": [1], "qs": [1], "precs": ["f16", "bf16"], "sub_qs": [10], "sub_bs": [63],
           "opts": {"sgd": ["sgd", 150.0]}, "runs": {"sgd": {"cosine": {"0": run, "1": cal}}}}
    m88 = {"sgd": {"cosine": {"cells": {f"skip{q}": {"d_global": 0.0, "d_main": 0.5} for q in (1, 2, 5)},
                              "frontier": {"saved": 0.0}}}}
    c = A.analyze(res, m88)["sgd"]["cosine"]["cells"]
    assert c["f16_1"]["d_up"] == 0.0 and c["f16_1"]["d_two"] == 1.0
    assert c["honest"]["flag_two"] == 0.0 and c["honest"]["d_two"] == 0.0
    assert c["skip1"]["d_up"] == 0.5               # 0.5 only clears the quiet zone's max
