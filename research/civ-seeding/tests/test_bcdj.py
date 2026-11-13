import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from civ_seeding import bcdj  # noqa: E402


@pytest.fixture(scope="module")
def villages():
    return bcdj.load()


def test_dataset_size(villages):
    assert len(villages) == 43
    assert sum(v.n for v in villages) == 9126
    assert sum(int(v.A.sum()) for v in villages) == 2 * 44367


def test_takeup_matches_paper(villages):
    # NBER w17743: non-leader take-up 18.5% (sd 8.4%), leaders 24.8% (sd 12.5%)
    tk = np.array([v.takeup[~v.leader].mean() for v in villages])
    tl = np.array([v.takeup[v.leader].mean() for v in villages])
    assert abs(tk.mean() - 0.185) < 0.005
    assert abs(tl.mean() - 0.248) < 0.005


def test_networks_connected(villages):
    for v in villages[:5]:
        reach = np.eye(v.n, dtype=bool)[0]
        for _ in range(v.n):
            nxt = reach | (v.A[reach].sum(0) > 0)
            if (nxt == reach).all():
                break
            reach = nxt
        assert reach.all()


def test_no_transmission_only_leaders_adopt(villages):
    v = villages[0]
    beta = np.array([50.0, 0, 0, 0, 0, 0, 0])  # everyone informed adopts
    Y = bcdj.simulate(v, beta, 0.0, 0.0, 20, np.random.default_rng(0))
    assert (Y[~v.leader] == 0).all()
    assert (Y[v.leader] == 1).all()


def test_full_transmission_informs_component(villages):
    v = villages[0]
    v.months = 400  # enough periods to cross the diameter
    Y, inf = bcdj.simulate(v, np.array([-50.0, 0, 0, 0, 0, 0, 0]), 1.0, 1.0, 5,
                           np.random.default_rng(1), return_informed=True)
    v.months = 31
    assert inf.all() and (Y == 0).all()


def test_transmission_probability(villages):
    # one period from a single informed node: neighbours told w.p. qN
    v = villages[1]
    leader = v.leader.copy()
    v.leader = np.zeros(v.n, bool)
    hub = int(np.argmax(v.deg))
    v.leader[hub] = True
    v.months = 4  # T = 2: decide, transmit, decide
    beta = np.array([-50.0, 0, 0, 0, 0, 0, 0])
    _, inf = bcdj.simulate(v, beta, 0.3, 0.9, 4000, np.random.default_rng(2), return_informed=True)
    v.leader, v.months = leader, 35
    told = inf[v.A[hub] > 0].mean()
    assert abs(told - 0.3) < 0.01


def test_empirical_moments(villages):
    m = np.mean([bcdj.moments(v, v.takeup.astype(float)) for v in villages], 0)
    np.testing.assert_allclose(m, [0.1108, 0.1952, 0.2114, 0.0625, 0.3933], atol=1e-4)


def test_moment_one_by_hand():
    A = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], float)
    v = bcdj.Village(1, 4, A, np.array([1, 0, 0]), np.array([True, False, False]),
                     np.zeros((3, 6))).prepare()
    m = bcdj.moments(v, np.array([0.0, 0.0, 1.0]))
    # node 0 has no adopting neighbour and does not adopt; node 2 has none and adopts
    assert m[0] == pytest.approx(0.5)
    # node 1 is next to the adopting leader (0) and to no non-adopting leader
    assert v.nb_taking_leader.tolist() == [False, True, False]
    assert m[1] == 0.0


def test_logit_recovers_coefficients():
    rng = np.random.default_rng(3)
    X = rng.normal(size=(20000, 2))
    b = np.array([-1.0, 0.5, -0.8])
    y = (rng.random(20000) < 1 / (1 + np.exp(-(b[0] + X @ b[1:])))).astype(float)
    est, se = bcdj.logit_fit(X, y)
    assert np.all(np.abs(est - b) < 4 * se)


def test_gmm_picks_zero_criterion():
    D = np.ones((3, 4, 5, 2))
    D[1, 2] = 0
    i, j, Q = bcdj.gmm_estimate(D)
    assert (i, j) == (1, 2) and Q[i, j] == 0
