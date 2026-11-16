"""Milestone 88 (experiments/proxy_forgery): sub-batch proxy forgeries, the zoned referee and the evasion frontier."""
import importlib.util
import os
import sys

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "proxy_forgery")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


def _load(name, fn):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, fn))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = _load("pfg_run", "run.py")
A = _load("pfg_analyze", "analyze.py")


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
def test_full_sub_batch_is_the_honest_step(kind):
    states, batches, lrs = _honest(kind)
    w, st = R.sub_forged(kind, states, batches, lrs, 0, 2, 64)
    assert np.array_equal(w, states[20][0])
    for a, b in zip(st, states[20][1]):
        assert np.array_equal(a, b)


def test_small_sub_batch_moves_away_from_honest():
    states, batches, lrs = _honest("momentum")
    w, st = R.sub_forged("momentum", states, batches, lrs, 0, 1, 1)
    assert not np.array_equal(st[0], states[20][1][0])


def test_saved_share():
    assert A.saved(64, 5) == 0 and A.saved(0, 20) == 1 and abs(A.saved(32, 1) - 1 / 40) < 1e-12


def test_zoned_referee_and_frontier_on_synthetic_results():
    nseg = 10
    keys = ["honest", "skip1"] + [f"sub{b}_1" for b in (1, 64)]

    def block(vals):
        return {k: list(v) for k, v in vals.items()}
    honest_cal = [0.1] * 5 + [1.0] * 5          # zone 0 is quiet, zone 1 is noisy
    cal = {"fp16": {"w": block({k: honest_cal for k in keys})},
           "reorder": {"w": block({k: [1e-3] * nseg for k in keys})}}
    test_v = {"honest": [0.05] * 5 + [0.9] * 5, "skip1": [0.5] * nseg, "sub1_1": [0.5] * nseg,
              "sub64_1": [0.05] * 5 + [0.9] * 5}
    run = {"fp16": {"w": block(test_v)},
           "reorder": {"w": block({"honest": [1e-3] * nseg, "skip1": [1.0] * nseg, "sub1_1": [1.0] * nseg,
                                   "sub64_1": [1e-3] * nseg})}}
    res = {"test_seeds": [0], "cal_seeds": [1], "qs": [1], "bs": [1, 64], "opts": {"sgd": ["sgd", 150.0]},
           "runs": {"sgd": {"cosine": {"0": run, "1": cal}}}}
    r = A.analyze(res)["sgd"]["cosine"]
    c = r["cells"]
    assert c["skip1"]["d_global"] == 0.0           # 0.5 is under the global max 1.0
    assert c["skip1"]["d_main"] == 0.5             # the zoned referee catches it in the quiet zone
    assert c["honest"]["d_main"] == 0.0 and r["F1_sub64_is_honest"]
    assert r["frontier"]["b"] == 1 and abs(r["frontier"]["saved"] - A.saved(1, 1)) < 1e-12
