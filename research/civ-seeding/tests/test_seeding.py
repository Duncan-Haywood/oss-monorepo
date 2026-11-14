import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from civ_seeding import bcdj, complex as cx, seeding as sd  # noqa: E402


@pytest.fixture(scope="module")
def setup():
    V = bcdj.load()
    return V, bcdj.leader_logit(V)[0]


@pytest.mark.parametrize("name", ["I", "T", "R"])
def test_batch_of_one_matches_complex_simulate(setup, name):
    V, beta = setup
    mod = sd.MODELS[name]
    for v in V[:3]:
        a = cx.simulate(v, beta, mod["qN"], mod["qP"], 20, np.random.default_rng([3, v.village]),
                        gamma=mod.get("gamma", 0.0), theta=mod.get("theta"),
                        delta=mod.get("delta", 0.0))
        b = sd.simulate_batch(v, beta, v.leader, 20, np.random.default_rng([3, v.village]),
                              return_matrix=True, **mod)
        assert (a == b).all()


def test_batch_columns_share_draws(setup):
    V, beta = setup
    v = V[0]
    X = np.stack([v.leader, v.leader], 1)
    out = sd.simulate_batch(v, beta, X, 10, np.random.default_rng(0), **sd.MODELS["T"])
    assert (out[0] == out[1]).all()


@pytest.mark.parametrize("rule", list(sd.STRUCTURAL))
def test_rules_give_budget(setup, rule):
    V, _ = setup
    for v in V[:5]:
        b = int(v.leader.sum())
        m = sd.STRUCTURAL[rule](v, b, np.random.default_rng(0))
        assert m.dtype == bool and m.sum() == b


def test_ball_is_connected(setup):
    V, _ = setup
    v = V[1]
    m = sd.rule_ball(v, 15)
    idx = np.flatnonzero(m)
    sub = v.A[np.ix_(idx, idx)]
    reach = np.zeros(len(idx), bool)
    reach[0] = True
    for _ in range(len(idx)):
        reach |= sub[reach].sum(0) > 0
    assert reach.all()


def test_patches_centres_not_adjacent(setup):
    V, _ = setup
    v = V[2]
    m = sd.rule_patches(v, 12)
    assert m.sum() == 12


def test_greedy_beats_random_on_a_small_budget(setup):
    V, beta = setup
    v = V[0]
    g = sd.rule_greedy(v, 3, beta, sd.MODELS["I"], S=16)
    assert g.sum() == 3
    rng = np.random.default_rng(9)
    vg = sd.simulate_batch(v, beta, g, 400, rng, **sd.MODELS["I"]).mean()
    R = np.stack([sd.rule_random(v, 3, np.random.default_rng(k)) for k in range(50)], 1)
    vr = sd.simulate_batch(v, beta, R, 8, np.random.default_rng(9), **sd.MODELS["I"]).mean()
    assert vg > vr


def test_kendall_tau():
    assert sd.kendall_tau([1, 2, 3], [1, 2, 3]) == pytest.approx(1)
    assert sd.kendall_tau([1, 2, 3], [3, 2, 1]) == pytest.approx(-1)


def test_diffusion_centrality_ranks_like_degree_on_a_star():
    A = np.zeros((5, 5))
    A[0, 1:] = A[1:, 0] = 1
    v = bcdj.Village(0, 8, A, np.zeros(5, int), np.zeros(5, bool), np.zeros((5, 6))).prepare()
    assert np.argmax(sd.diffusion_centrality(v)) == 0
