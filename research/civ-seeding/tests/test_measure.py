import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from civ_seeding import bcdj, complex as cx, measure as ms  # noqa: E402


@pytest.fixture(scope="module")
def setup():
    V = bcdj.load()
    return V, bcdj.leader_logit(V)[0]


@pytest.mark.parametrize("kw", [{}, {"theta": 0.6}, {"gamma": 0.1, "delta": -0.25}])
def test_tracked_matches_simulate(setup, kw):
    V, beta = setup
    v = V[5]
    Y1 = cx.simulate(v, beta, 0.075, 0.2, 40, np.random.default_rng(3), **kw)
    Y2, inf, ta = ms.simulate_tracked(v, beta, 0.075, 0.2, 40, np.random.default_rng(3), **kw)
    assert (Y1 == Y2).all()
    assert ((ta >= 0) == (Y2 > 0)).all()          # an adoption period iff adopted
    assert (inf[Y2 > 0]).all()                    # adopters were informed
    assert (ta < v.T).all()


def test_information_model_adopts_when_first_informed(setup):
    # under I a household decides once: no adopter waits after the first informed period,
    # so the adoption period of every non-leader adopter is >= 1 and leaders adopt at 0
    V, beta = setup
    v = V[0]
    Y, inf, ta = ms.simulate_tracked(v, beta, 0.05, 0.3, 60, np.random.default_rng(1))
    assert (ta[v.leader][Y[v.leader] > 0] == 0).all()
    assert (ta[~v.leader][Y[~v.leader] > 0] >= 1).all()


def test_timing_hazard_matches_hand_count(setup):
    V, _ = setup
    v = V[1]
    rng = np.random.default_rng(0)
    ta = np.where(rng.random((v.n, 1)) < 0.2, rng.integers(0, v.T, (v.n, 1)), -1)
    got = ms.moments_timing(v, ta)[0]
    num = np.zeros(4)
    den = np.zeros(4)
    for t in range(v.T):
        prior = (ta[:, 0] >= 0) & (ta[:, 0] < t)
        k = np.minimum(v.A @ prior, 3).astype(int)
        for i in np.where(~v.leader & ~prior)[0]:
            den[k[i]] += 1
            num[k[i]] += ta[i, 0] == t
    assert np.allclose(got[:4], num / den)


def test_misreport_rates():
    rng = np.random.default_rng(0)
    aware = np.zeros((20000, 2), bool)
    aware[:10000] = True
    r = ms.misreport(aware, rng, 0.15, 0.05)
    assert abs(1 - r[:10000].mean() - 0.15) < 0.01
    assert abs(r[10000:].mean() - 0.05) < 0.01


def test_share_bins_partition_and_hand_count(setup):
    # milestone 26: every aware non-leader falls in exactly one share bin, and the rates match
    # a direct count on one simulation
    V, beta = setup
    v = V[3]
    Y, inf, _ = ms.simulate_tracked(v, beta, 0.075, 0.2, 5, np.random.default_rng(4), theta=0.6)
    out = ms.moments_aware_share(v, Y, inf)
    assert out.shape == (5, 4)
    sh = (v.A @ Y) / np.maximum(v.deg, 1)[:, None]
    aw = inf & (~v.leader)[:, None]
    hits = sum(((sh >= lo) & (sh <= hi)).astype(int) for lo, hi in ms.SHARE_BINS)
    assert (hits[aw] == 1).all()
    s = 0
    col = aw[:, s]
    m = col & (sh[:, s] >= 0.6)
    if m.sum():
        assert abs(out[s, 3] - Y[m, s].mean()) < 1e-12


def test_threshold_takes_up_above_theta(setup):
    # under a threshold of 0.6 an aware non-leader whose adopting share reached 0.6 by the
    # last period's start adopted; at the survey the [0.6, 1] bin's take-up is high
    V, beta = setup
    v = V[3]
    Y, inf, _ = ms.simulate_tracked(v, beta, 0.075, 0.2, 200, np.random.default_rng(5), theta=0.6)
    out = ms.moments_aware_share(v, Y, inf)
    hi = out[:, 3][out[:, 3] > 0]
    assert hi.size == 0 or hi.mean() > out[:, 0].mean()


def test_share_moments_without_awareness(setup):
    V, beta = setup
    v = V[2]
    Y, inf, _ta = ms.simulate_tracked(v, beta, 0.075, 0.2, 30, np.random.default_rng(7), theta=0.6)
    M = ms.moments_share(v, Y)
    assert M.shape == (30, 4)
    assert np.allclose(M, ms.moments_aware_share(v, Y, np.ones_like(inf)))
    # by hand for one column and the top bin
    nl = ~v.leader
    sh = (v.A @ Y[:, 0]) / np.maximum(v.deg, 1)
    m = nl & (sh >= 0.6)
    assert np.isclose(M[0, 3], Y[m, 0].mean() if m.any() else 0.0)
    # 1-d input, and bin counts cover every non-leader
    assert np.allclose(ms.moments_share(v, Y[:, 0]), M[0])
    assert (ms.share_counts(v, Y).sum(1) == nl.sum()).all()
    assert ((M >= 0) & (M <= 1)).all()
