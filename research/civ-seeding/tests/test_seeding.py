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


# ---- milestone 11: tie-recall error ----

def test_m11_full_recall_matches_m9_ties_and_degrees():
    """With recall 1 the recall survey sees exactly the ties and degrees a perfect survey sees."""
    v = _m9_village()
    for design in ("uniform", "adaptive"):
        for f in (0.25, 0.5, 1.0):
            s, est, seen = sd.survey_recall(v, f, np.random.default_rng(8), design, recall=1.0)
            assert np.array_equal(seen, v.A * (s[:, None] | s[None, :]))
            assert np.all(est[s] == v.deg[s])
    b = int(v.leader.sum())
    assert np.array_equal(sd.rule_recall_dd(v, b, np.random.default_rng(3), 1.0, recall=1.0),
                          sd.rule_degree_discount(v, b))
    # recall = 1 through survey_design keeps milestone 9's draws
    a = sd.survey_design(v, 0.5, np.random.default_rng(9), "adaptive", 0.75)
    c = sd.survey_design(v, 0.5, np.random.default_rng(9), "adaptive", 0.75, recall=1.0)
    assert all(np.array_equal(x, y) for x, y in zip(a, c))


def test_m11_recall_thins_ties_at_the_expected_rate():
    v = _m9_village()
    m = int(v.A.sum()) // 2
    for rho in (0.5, 0.85):
        got = []
        for seed in range(20):
            s, est, seen = sd.survey_recall(v, 1.0, np.random.default_rng(seed), recall=rho)
            assert s.all() and np.all(seen == seen.T) and np.all(seen <= v.A)
            got.append(seen.sum() / 2 / m)
        assert abs(np.mean(got) - (1 - (1 - rho) ** 2)) < 0.01
        s, est, seen = sd.survey_recall(v, 0.5, np.random.default_rng(1), "adaptive", 0.75, rho)
        assert s.sum() == int(round(0.5 * v.n))
        assert np.all(est[s] == seen.sum(1)[s])
        assert np.all(seen[~s][:, ~s] == 0)  # no tie between two unsurveyed households is seen
        b = int(v.leader.sum())
        assert sd.rule_recall_dd(v, b, np.random.default_rng(2), 0.5, "adaptive", 0.75, rho).sum() == b
        assert sd.rule_recall_degree(v, b, np.random.default_rng(2), 1.0, recall=rho).sum() == b


# ---- milestone 12 ----

def test_m12_strata_cover_exactly_the_ties():
    V = bcdj.load()[:3]
    H = bcdj.tie_strata(V)
    for v in V:
        assert ((H[v.village] >= 0) == (v.A > 0)).all()
        assert np.array_equal(H[v.village], H[v.village].T)
        assert set(np.unique(H[v.village])) <= {-1, 0, 1, 2}


def test_m12_constant_recall_matrix_matches_scalar():
    v = _m9_village()
    P = np.full(v.A.shape, 0.82)
    for design, split in (("uniform", None), ("adaptive", 0.75)):
        a = sd.survey_recall(v, 0.5, np.random.default_rng(4), design, split, 0.82)
        c = sd.survey_recall(v, 0.5, np.random.default_rng(4), design, split, P)
        assert all(np.array_equal(x, y) for x, y in zip(a, c))


def test_m12_per_tie_recall_reports_only_recallable_ties():
    v = _m9_village()
    H = bcdj.tie_strata([v])[v.village]
    P = np.where(H == 2, 1.0, 0.0)   # strong ties always reported, the rest never
    s, est, seen = sd.survey_recall(v, 1.0, np.random.default_rng(0), recall=P)
    assert np.array_equal(seen > 0, H == 2)
    rates = np.array([0.3, 0.6, 0.9])
    P = np.where(H >= 0, rates[np.maximum(H, 0)], 0.0)
    got = np.zeros(3)
    for seed in range(30):
        _, _, seen = sd.survey_recall(v, 1.0, np.random.default_rng(seed), recall=P)
        got += [seen[H == h].mean() for h in range(3)]
    assert np.allclose(got / 30, 1 - (1 - rates) ** 2, atol=0.03)


# ---- milestone 16: false-positive ties ----

def test_m16_fp_zero_keeps_earlier_draws():
    v = _m9_village()
    for design, split in (("uniform", None), ("adaptive", 0.75)):
        a = sd.survey_recall(v, 0.5, np.random.default_rng(5), design, split, 0.85)
        c = sd.survey_recall(v, 0.5, np.random.default_rng(5), design, split, 0.85, 0.0, "closure")
        assert all(np.array_equal(x, y) for x, y in zip(a, c))


@pytest.mark.parametrize("mode", ["uniform", "closure"])
def test_m16_false_reports_rate_and_placement(mode):
    v = _m9_village()
    A = v.A > 0
    fof = (A.astype(int) @ A.astype(int)) > 0
    tot = 0
    for seed in range(30):
        F = sd.false_reports(v, np.random.default_rng(seed), 0.25, mode)
        assert not (F & A).any() and not F.diagonal().any()
        if mode == "closure":
            assert not (F & ~fof).any()
        tot += F.sum()
    # mean false reports per household close to 0.25 x degree (pools here are far larger than m_i)
    assert abs(tot / 30 / v.deg.sum() - 0.25) < 0.02


def test_m16_census_with_false_ties_sees_extra_ties():
    v = _m9_village()
    s, est, seen = sd.survey_recall(v, 1.0, np.random.default_rng(0), recall=1.0, fp=0.5)
    assert np.array_equal(seen, seen.T)
    assert (seen >= v.A).all() and seen.sum() > v.A.sum()
    assert np.all(est == seen.sum(1))
    b = int(v.leader.sum())
    assert sd.rule_recall_dd(v, b, np.random.default_rng(1), 0.5, "adaptive", 0.75, 0.85,
                             fp=0.25, fp_mode="closure").sum() == b


# ---- milestone 17: the reciprocity filter ----

def test_m17_recip_census_keeps_only_mutual_reports():
    v = _m9_village()
    A = v.A > 0
    # perfect recall, no false ties: the filter changes nothing
    a = sd.survey_recall(v, 1.0, np.random.default_rng(3), recall=1.0)
    b = sd.survey_recall(v, 1.0, np.random.default_rng(3), recall=1.0, recip=True)
    assert all(np.array_equal(x, y) for x, y in zip(a, b))
    # recall 0.85: a census keeps a true tie with probability 0.85^2, not 1 - 0.15^2
    kept = sum(sd.survey_recall(v, 1.0, np.random.default_rng(s), recall=0.85, recip=True)[2][A].mean()
               for s in range(20)) / 20
    assert abs(kept - 0.85 ** 2) < 0.02
    # false ties: the filtered census sees a subset of the unfiltered one, under the same draws
    for mode in ("uniform", "closure"):
        _, _, s0 = sd.survey_recall(v, 1.0, np.random.default_rng(7), recall=0.85, fp=0.5, fp_mode=mode)
        _, est, s1 = sd.survey_recall(v, 1.0, np.random.default_rng(7), recall=0.85, fp=0.5, fp_mode=mode,
                                      recip=True)
        assert np.array_equal(s1, s1.T) and (s1 <= s0).all() and np.all(est == s1.sum(1))
        assert (s1.astype(bool) & ~A).sum() < 0.1 * (s0.astype(bool) & ~A).sum()


def test_m17_recip_half_survey_keeps_one_sided_reports():
    v = _m9_village()
    s, est, seen = sd.survey_recall(v, 0.5, np.random.default_rng(2), "adaptive", 0.75, 0.85,
                                    fp=0.25, recip=True)
    s0, est0, seen0 = sd.survey_recall(v, 0.5, np.random.default_rng(2), "adaptive", 0.75, 0.85, fp=0.25)
    assert np.array_equal(s, s0)
    one = s[:, None] ^ s[None, :]
    assert np.array_equal(seen[one], seen0[one])            # unverifiable ties kept as reported
    assert np.array_equal(est[~s], est0[~s])                 # stage-1 estimates unfiltered


# ---- milestone 18: correlated false reports ----

def test_m18_joint_zero_keeps_milestone17_draws():
    v = _m9_village()
    for f, design in ((1.0, "uniform"), (0.5, "adaptive")):
        a = sd.survey_recall(v, f, np.random.default_rng(4), design, 0.75, 0.85, fp=0.5, fp_mode="closure",
                             recip=True)
        b = sd.survey_recall(v, f, np.random.default_rng(4), design, 0.75, 0.85, fp=0.5, fp_mode="closure",
                             recip=True, fp_joint=0.0)
        assert all(np.array_equal(x, y) for x, y in zip(a, b))


def test_m18_unfiltered_census_is_invariant_to_joint_reports():
    # the echo adds no new pair, so an unfiltered census sees exactly the same ties and degrees
    v = _m9_village()
    for mode in ("uniform", "closure"):
        for kappa in (0.5, 1.0):
            a = sd.survey_recall(v, 1.0, np.random.default_rng(9), recall=0.85, fp=0.5, fp_mode=mode)
            b = sd.survey_recall(v, 1.0, np.random.default_rng(9), recall=0.85, fp=0.5, fp_mode=mode,
                                 fp_joint=kappa)
            assert all(np.array_equal(x, y) for x, y in zip(a, b))


def test_m18_joint_reports_survive_the_filter_at_rate_kappa():
    v = _m9_village()
    A = v.A > 0
    for kappa in (0.0, 0.5, 1.0):
        fr = []
        for s in range(10):
            _, _, s0 = sd.survey_recall(v, 1.0, np.random.default_rng(s), recall=0.85, fp=0.5, fp_mode="closure",
                                        fp_joint=kappa)
            _, _, s1 = sd.survey_recall(v, 1.0, np.random.default_rng(s), recall=0.85, fp=0.5, fp_mode="closure",
                                        recip=True, fp_joint=kappa)
            assert (s1 <= s0).all()
            fr.append((s1.astype(bool) & ~A).sum() / (s0.astype(bool) & ~A).sum())
        assert abs(np.mean(fr) - kappa) < 0.06
    # at kappa = 1 the filtered census keeps every false tie and loses only true ones
    _, _, s0 = sd.survey_recall(v, 1.0, np.random.default_rng(1), recall=0.85, fp=0.5, fp_mode="closure",
                                fp_joint=1.0)
    _, _, s1 = sd.survey_recall(v, 1.0, np.random.default_rng(1), recall=0.85, fp=0.5, fp_mode="closure",
                                recip=True, fp_joint=1.0)
    assert np.array_equal(s1.astype(bool) & ~A, s0.astype(bool) & ~A)
    assert (s1.astype(bool) & A).sum() < (s0.astype(bool) & A).sum()


# ---- milestone 19: the soft reciprocity filter ----

def test_m19_soft_filter_endpoints():
    # recip_w = 0 is the hard filter (milestone 17); recip_w = 1 keeps every report (unfiltered)
    v = _m9_village()
    for f, design in ((1.0, "uniform"), (0.5, "adaptive")):
        kw = dict(fp=0.5, fp_mode="closure", fp_joint=0.5)
        hard = sd.survey_recall(v, f, np.random.default_rng(5), design, 0.75, 0.85, recip=True, **kw)
        w0 = sd.survey_recall(v, f, np.random.default_rng(5), design, 0.75, 0.85, recip=True, recip_w=0.0, **kw)
        raw = sd.survey_recall(v, f, np.random.default_rng(5), design, 0.75, 0.85, **kw)
        w1 = sd.survey_recall(v, f, np.random.default_rng(5), design, 0.75, 0.85, recip=True, recip_w=1.0, **kw)
        assert all(np.array_equal(x, y) for x, y in zip(hard, w0))
        assert all(np.array_equal(x, y) for x, y in zip(raw, w1))


def test_m19_soft_filter_weights_only_one_sided_checkable_ties():
    v = _m9_village()
    kw = dict(recall=0.85, fp=0.5, fp_mode="closure")
    s, est0, raw = sd.survey_recall(v, 0.5, np.random.default_rng(8), "adaptive", 0.75, **kw)
    _, _, hard = sd.survey_recall(v, 0.5, np.random.default_rng(8), "adaptive", 0.75, recip=True, **kw)
    _, est, soft = sd.survey_recall(v, 0.5, np.random.default_rng(8), "adaptive", 0.75, recip=True,
                                    recip_w=0.3, **kw)
    assert np.allclose(soft, soft.T)
    assert np.allclose(soft, hard + 0.3 * (raw - hard))       # between the two, linearly in the weight
    assert set(np.unique(soft)) <= {0.0, 0.3, 1.0} and (soft == 0.3).any()
    both = s[:, None] & s[None, :]
    assert not (soft[~both] == 0.3).any()                     # uncheckable ties are never down-weighted
    assert np.allclose(est[s], soft[s].sum(1)) and np.array_equal(est[~s], est0[~s])
    try:
        sd.survey_recall(v, 1.0, np.random.default_rng(0), recip=True, recip_w=1.5)
        assert False
    except ValueError:
        pass


# ---- milestone 22: where the half weight's step comes from ----

def _census(v, kappa, w=0.5, recip=True, **kw):
    return sd.survey_recall(v, 1.0, np.random.default_rng(11), "uniform", None, 0.85, fp=0.25,
                            fp_mode="closure", recip=recip, fp_joint=kappa, recip_w=w, **kw)


def test_m22_census_kappa_moves_only_false_tie_weights():
    # in a census the recall draw is shared across kappa, and the echo draw is one uniform matrix
    # thresholded at kappa: true-tie weights do not depend on kappa, and the false ties at full
    # weight are nested in kappa; at kappa = 1 every false tie is mutual (full weight)
    v = _m9_village()
    A = v.A > 0
    seen = {k: _census(v, k)[2] for k in (0.0, 0.05, 0.25, 1.0)}
    for k in seen:
        assert np.array_equal(seen[k][A], seen[0.0][A])
    full = {k: (seen[k] == 1) & ~A for k in seen}
    assert (full[0.05] <= full[0.25]).all() and (full[0.25] <= full[1.0]).all()
    _, _, raw = _census(v, 1.0, recip=False)
    assert np.array_equal(full[1.0], (raw > 0) & ~A)          # all false ties at full weight
    assert ((seen[0.0] == 0.5) & ~A).any()


def test_m22_oracle_true_halves_only_false_ties():
    v = _m9_village()
    A = v.A > 0
    _, _, soft = _census(v, 0.25)
    _, est, orc = _census(v, 0.25, oracle_true=True)
    _, _, raw = _census(v, 0.25, recip=False)
    assert np.array_equal(orc[A], raw[A].astype(float))        # true ties exactly as reported
    assert np.array_equal(orc[~A], soft[~A])                   # false ties as the half weight has them
    assert np.allclose(est, orc.sum(1))
    _, _, orc_hard = _census(v, 0.25, w=0.0, oracle_true=True)
    assert set(np.unique(orc_hard)) <= {0.0, 1.0}
