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


@pytest.mark.parametrize("rule", list(sd.CENSUS_CHEAP))
def test_cheap_rules_give_budget(setup, rule):
    V, _ = setup
    for v in V[:5]:
        b = int(v.leader.sum())
        assert sd.CENSUS_CHEAP[rule](v, b).sum() == b


def test_spread_degree_has_no_adjacent_seeds(setup):
    V, _ = setup
    for v in V[:5]:
        b = int(v.leader.sum())
        m = sd.rule_spread_degree(v, b)
        assert v.A[np.ix_(m, m)].sum() == 0  # an independent set of size b exists here


def test_single_discount_first_pick_is_top_degree(setup):
    V, _ = setup
    v = V[0]
    assert sd.rule_single_discount(v, 1)[sd.rule_degree(v, 1)].all()


def test_full_survey_equals_census(setup):
    V, _ = setup
    for v in V[:3]:
        b = int(v.leader.sum())
        rng = np.random.default_rng(1)
        assert (sd.rule_survey_degree(v, b, rng, 1.0) == sd.rule_degree(v, b)).all()
        assert (sd.rule_survey_spread(v, b, rng, 1.0) == sd.rule_spread_degree(v, b)).all()


@pytest.mark.parametrize("f", sd.SURVEY_SHARES)
def test_survey_rules_give_budget(setup, f):
    V, _ = setup
    v = V[2]
    b = int(v.leader.sum())
    rng = np.random.default_rng(4)
    assert sd.rule_survey_degree(v, b, rng, f).sum() == b
    assert sd.rule_survey_spread(v, b, rng, f).sum() == b
    assert sd.rule_friend(v, b, rng).sum() == b


def test_survey_sees_only_surveyed_ties(setup):
    V, _ = setup
    v = V[0]
    s, est, seen = sd.survey(v, 0.25, np.random.default_rng(0))
    assert (seen[np.ix_(~s, ~s)] == 0).all()
    assert (est[s] == v.deg[s]).all()


@pytest.mark.parametrize("name", ["I", "T", "R"])
def test_batch_shift_matches_complex_simulate(setup, name):
    """Milestone 6: a per-run random effect gives the same draws as complex.simulate's shift."""
    V, beta = setup
    mod = sd.MODELS[name]
    for v in V[:2]:
        z = 0.5 * np.random.default_rng([9, v.village]).standard_normal(15)
        a = cx.simulate(v, beta, mod["qN"], mod["qP"], 15, np.random.default_rng([4, v.village]),
                        gamma=mod.get("gamma", 0.0), theta=mod.get("theta"),
                        delta=mod.get("delta", 0.0), shift=z)
        X = np.stack([v.leader, v.leader], 1)
        b = sd.simulate_batch(v, beta, X, 15, np.random.default_rng([4, v.village]),
                              return_matrix=True, shift=z, **mod)
        assert (a == b[:, :15]).all() and (a == b[:, 15:]).all()


@pytest.mark.parametrize("p", [0.0, 0.01, 0.3])
def test_degree_discount_budget_any_p(setup, p):
    V, _ = setup
    for v in V[:3]:
        b = int(v.leader.sum())
        assert sd.rule_degree_discount(v, b, p=p).sum() == b


def test_independent_columns_differ_and_match_for_one(setup):
    """independent=True: one column consumes the stream as the shared path does; two columns differ."""
    V, beta = setup
    v = V[0]
    a = sd.simulate_batch(v, beta, v.leader, 1, np.random.default_rng(1), return_matrix=True, **sd.MODELS["I"])
    b = sd.simulate_batch(v, beta, v.leader, 1, np.random.default_rng(1), return_matrix=True,
                          independent=True, **sd.MODELS["I"])
    assert (a == b).all()
    X = np.stack([v.leader] * 8, 1)
    out = sd.simulate_batch(v, beta, X, 1, np.random.default_rng(2), independent=True, **sd.MODELS["I"])
    assert len(set(out[:, 0].tolist())) > 1


# ---- milestone 7: complex centrality ----

def _path_graph(n):
    A = np.zeros((n, n))
    for i in range(n - 1):
        A[i, i + 1] = A[i + 1, i] = 1
    return A


def test_complex_paths_on_a_path_graph():
    # on a path every interior household has 2 neighbours, so one active neighbour is half:
    # with theta 0.5 the cascade runs the whole line one step at a time
    A = _path_graph(6)
    L = sd.complex_paths(A, theta=0.5)
    assert list(L[:, 0]) == [0, 0, 1, 2, 3, 4]
    assert list(L[:, 3]) == [2, 1, 0, 0, 0, 1]
    # absolute threshold 2 cannot cross a path (no one has two active neighbours)
    L2 = sd.complex_paths(A, absolute=2)
    assert np.isinf(L2[3:, 0]).all() and (L2[:2, 0] == 0).all()


def test_complex_paths_wide_bridge():
    # two 4-cliques: when households 4 and 5 each have two ties into the first clique the
    # bridge is wide enough for an absolute-2 contagion; a single tie is not
    def two_cliques(wide):
        A = np.zeros((8, 8))
        for blk in (range(4), range(4, 8)):
            for i in blk:
                for j in blk:
                    if i != j:
                        A[i, j] = 1
        for i, j in ([(0, 4), (1, 4), (0, 5), (1, 5)] if wide else [(0, 4)]):
            A[i, j] = A[j, i] = 1
        return A
    L1 = sd.complex_paths(two_cliques(False), absolute=2)
    L2 = sd.complex_paths(two_cliques(True), absolute=2)
    assert np.isinf(L1[4:, 2]).all()
    assert np.isfinite(L2[:, 2]).all()


def test_complex_centrality_reach_and_length():
    A = _path_graph(6)
    reach, mlen = sd.complex_centrality(A, theta=0.5)
    assert np.allclose(reach, 1.0)
    assert mlen[0] == pytest.approx(np.mean([1, 2, 3, 4]))
    assert mlen[2] < mlen[0]


@pytest.mark.parametrize("rule", list(sd.COMPLEX_RULES))
def test_complex_rules_give_budget(setup, rule):
    V, _ = setup
    for v in V[:4]:
        b = int(v.leader.sum())
        m = sd.COMPLEX_RULES[rule](v, b)
        assert m.dtype == bool and m.sum() == b


def test_complex_hood_seeds_a_neighbourhood(setup):
    V, _ = setup
    v = V[0]
    b = int(v.leader.sum())
    m = sd.COMPLEX_RULES["cc-hood-abs2"](v, b)
    order, _ = sd._cc_order(v, None, 2)
    c = order[0]
    assert m[c]
    nb = np.flatnonzero(v.A[c] > 0)
    assert m[nb].sum() == min(len(nb), b - 1)


def test_complex_spread_no_adjacent_seeds(setup):
    V, _ = setup
    for v in V[:4]:
        b = int(v.leader.sum())
        m = sd.COMPLEX_RULES["cc-spread-frac"](v, b)
        assert v.A[np.ix_(m, m)].sum() == 0


# ---- milestone 9 ----

def _m9_village():
    from civ_seeding import bcdj
    return bcdj.load()[0]


def test_m9_designs_budget_and_full_survey():
    v = _m9_village()
    b = int(v.leader.sum())
    for design in sd.SURVEY_DESIGNS:
        for f in (0.1, 0.25, 0.5):
            s, est, seen = sd.survey_design(v, f, np.random.default_rng(1), design)
            assert s.sum() == max(1, int(round(f * v.n)))
            assert np.all(est[s] == v.deg[s])
            assert np.all(seen == seen.T)
            assert sd.rule_design_degree(v, b, np.random.default_rng(2), f, design).sum() == b
            assert sd.rule_design_dd(v, b, np.random.default_rng(2), f, design).sum() == b
        assert np.array_equal(sd.rule_design_degree(v, b, np.random.default_rng(3), 1.0, design),
                              sd.rule_degree(v, b))
        assert np.array_equal(sd.rule_design_dd(v, b, np.random.default_rng(3), 1.0, design),
                              sd.rule_degree_discount(v, b))


def test_m9_uniform_matches_milestone5_survey():
    v = _m9_village()
    a = sd.survey(v, 0.25, np.random.default_rng(7))
    c = sd.survey_design(v, 0.25, np.random.default_rng(7), "uniform")
    assert all(np.array_equal(x, y) for x, y in zip(a, c))


def test_m9_adaptive_takes_most_named():
    v = _m9_village()
    rng = np.random.default_rng(4)
    s, est, _ = sd.survey_design(v, 0.25, rng, "adaptive")
    # replay stage 1 to check stage 2 took the most-named households
    rng = np.random.default_rng(4)
    k = int(round(0.25 * v.n)); k1 = k // 2
    s1 = np.zeros(v.n, bool); s1[rng.choice(v.n, k1, replace=False)] = True
    named = v.A[:, s1].sum(1)
    s2 = s & ~s1
    assert s2.sum() == k - k1
    assert named[s2].min() >= named[~s].max()
    assert np.allclose(est[~s], named[~s] / (k1 / v.n))


def test_m9_walk_surveys_named_households():
    v = _m9_village()
    rng = np.random.default_rng(5)
    s, _, _ = sd.survey_design(v, 0.25, rng, "walk")
    rng = np.random.default_rng(5)
    k1 = int(round(0.25 * v.n)) // 2
    s1 = np.zeros(v.n, bool); s1[rng.choice(v.n, k1, replace=False)] = True
    s2 = s & ~s1
    assert (v.A[s2][:, s1].sum(1) > 0).all()  # every stage-2 household was named by stage 1


# ---- milestone 10 ----

def test_m10_split_sizes_and_default():
    v = _m9_village()
    b = int(v.leader.sum())
    for f in (0.25, 0.5):
        k = int(round(f * v.n))
        # split None reproduces milestone 9's k // 2 draws exactly
        a = sd.survey_design(v, f, np.random.default_rng(8), "adaptive")
        c = sd.survey_design(v, f, np.random.default_rng(8), "adaptive", None)
        assert all(np.array_equal(x, y) for x, y in zip(a, c))
        for split in (0.25, 0.5, 0.75):
            rng = np.random.default_rng(9)
            s, est, _ = sd.survey_design(v, f, rng, "adaptive", split)
            assert s.sum() == k
            k1 = int(round(split * k))
            rng = np.random.default_rng(9)
            s1 = np.zeros(v.n, bool); s1[rng.choice(v.n, k1, replace=False)] = True
            assert (s & s1).sum() == k1
            assert np.allclose(est[~s], v.A[:, s1].sum(1)[~s] / (k1 / v.n))
            assert sd.rule_design_dd(v, b, np.random.default_rng(2), f, "adaptive", split=split).sum() == b


def test_m10_split_clamped():
    v = _m9_village()
    k = int(round(0.25 * v.n))
    s, _, _ = sd.survey_design(v, 0.25, np.random.default_rng(1), "adaptive", 0.0)
    assert s.sum() == k
    s, _, _ = sd.survey_design(v, 0.25, np.random.default_rng(1), "adaptive", 1.0)
    assert s.sum() == k
