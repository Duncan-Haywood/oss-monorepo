import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from llmci import estimators as E  # noqa: E402


def corpus(n, prev, sens, spec, rng):
    y = [1 if rng.random() < prev else 0 for _ in range(n)]
    f = [(1 if rng.random() < sens else 0) if t else (0 if rng.random() < spec else 1) for t in y]
    return y, f


def test_endpoints_of_lambda():
    rng = random.Random(1)
    y, f = corpus(500, 0.3, 0.8, 0.9, rng)
    ya, fa, fu = y[:100], f[:100], f[100:]
    assert E.ppi(ya, fa, fu, lam=0).value == E.human_only(ya).value
    assert math.isclose(E.ppi(ya, fa, fu, lam=0).se, E.human_only(ya).se)
    # lam=1: mean(y) + mean(f_unl) - mean(f)
    assert math.isclose(E.ppi(ya, fa, fu).value, sum(ya) / 100 + sum(fu) / 400 - sum(fa) / 100)


def test_perfect_coder_ppi_se_is_only_the_unaudited_sampling_term():
    y = [1, 0, 1, 0, 0, 1, 0, 0]
    est = E.ppi(y[:4], y[:4], y[4:])
    assert math.isclose(est.value, sum(y[4:]) / 4 + sum(y[:4]) / 4 - sum(y[:4]) / 4 + 0)
    assert math.isclose(est.se, math.sqrt(E._var(y[4:]) / 4))


def test_ppi_pp_never_much_wider_than_human_only_for_useless_coder():
    rng = random.Random(2)
    y = [1 if rng.random() < 0.3 else 0 for _ in range(300)]
    f = [1 if rng.random() < 0.3 else 0 for _ in range(300)]  # independent of y
    lam = E.ppi_pp_lambda(y[:100], f[:100], f[100:])
    assert lam < 0.3
    assert E.ppi_pp(y[:100], f[:100], f[100:]).se < 1.15 * E.human_only(y[:100]).se


def test_ipw_equals_ppi_form_when_pi_constant_and_matches_closed_form():
    f_all = [1, 0, 1, 1, 0, 0, 1, 0]
    aud = [0, 2, 4, 6]
    y = {0: 1, 2: 0, 4: 0, 6: 1}
    est = E.ipw_audit(f_all, aud, y, [0.5] * 8)
    assert math.isclose(est.value, sum(f_all) / 8 + sum((y[i] - f_all[i]) / 0.5 for i in aud) / 8)
    r2 = sum((y[i] - f_all[i]) ** 2 for i in aud)
    assert math.isclose(est.se, math.sqrt(r2 * (0.5 / 0.25)) / 8)
    assert E.ipw_audit(f_all, aud, y, [1.0] * 8).se == 0  # census audit: no sampling variance


def test_stratified_single_stratum_matches_fpc_closed_form():
    rng = random.Random(3)
    y, f = corpus(200, 0.2, 0.7, 0.9, rng)
    idx = rng.sample(range(200), 40)
    est = E.stratified_ppi([(200, f, [y[i] for i in idx], [f[i] for i in idx])])
    r = [y[i] - f[i] for i in idx]
    assert math.isclose(est.value, sum(f) / 200 + sum(r) / 40)
    assert math.isclose(est.se, math.sqrt((1 - 40 / 200) * E._var(r) / 40))


def test_label_shift_recovers_prevalence_with_exact_rates():
    # corpus: 30% positive, tpr 0.8, fpr 0.1 -> q = 0.3*0.8 + 0.7*0.1 = 0.31
    f_all = [1] * 31 + [0] * 69
    y = [1] * 10 + [0] * 10
    f = [1] * 8 + [0] * 2 + [1] * 1 + [0] * 9
    est = E.label_shift(f_all, y, f)
    assert math.isclose(est.value, (0.31 - 0.1) / 0.7)


def _coverage(method, reps, seed):
    rng = random.Random(seed)
    hits, widths, truth_n = 0, [], 2000
    for _ in range(reps):
        y, f = corpus(truth_n, 0.25, 0.75, 0.9, rng)
        idx = rng.sample(range(truth_n), 150)
        s = set(idx)
        ya, fa = [y[i] for i in idx], [f[i] for i in idx]
        fu = [f[i] for i in range(truth_n) if i not in s]
        yu = [y[i] for i in range(truth_n) if i not in s]
        est = method(y, f, idx, ya, fa, fu)
        hits += E.covers(est, sum(y) / truth_n)
        widths.append(2 * E.Z95 * est.se)
    return hits / reps, sum(widths) / reps


def test_monte_carlo_coverage_and_gain():
    reps = 600
    cov_h, w_h = _coverage(lambda y, f, idx, ya, fa, fu: E.human_only(ya), reps, 10)
    cov_p, w_p = _coverage(lambda y, f, idx, ya, fa, fu: E.ppi_pp(ya, fa, fu), reps, 10)
    cov_s, w_s = _coverage(
        lambda y, f, idx, ya, fa, fu: E.stratified_ppi([(len(y), f, ya, fa)]), reps, 10)
    # binomial sd of a coverage near 0.95 over 600 reps is 0.009; allow 3 sd
    for c in (cov_p, cov_s):
        assert abs(c - 0.95) < 0.03, c
    # human-only ignores the finite population: conservative here (n/N = 7.5%)
    assert cov_h >= 0.94
    assert w_p < w_h and w_s < w_h


def test_stratified_human_closed_form():
    # two strata, W = 0.25 / 0.75; audit y = [1,0,1,1] (N=100) and [0,0,1,0] (N=300)
    est = E.stratified_human([(100, [1, 0, 1, 1]), (300, [0, 0, 1, 0])])
    assert abs(est.value - (0.25 * 0.75 + 0.75 * 0.25)) < 1e-12
    v = 0.25**2 * (1 - 4 / 100) * 0.25 / 4 + 0.75**2 * (1 - 4 / 300) * 0.25 / 4
    assert abs(est.se - v**0.5) < 1e-12


def test_ipw_audit_wilson_inside_unit_interval_and_matches_normal_when_large():
    import random
    rng = random.Random(3)
    n = 4000
    y = [int(rng.random() < 0.4) for _ in range(n)]
    f = [int(rng.random() < 0.4) for _ in range(n)]
    pi = [0.1] * n
    aud = [i for i in range(n) if rng.random() < 0.1]
    ys = {i: y[i] for i in aud}
    est = E.ipw_audit(f, aud, ys, pi)
    lo, hi = E.ipw_audit_wilson(f, aud, ys, pi)
    nlo, nhi = E.interval(est)
    assert abs(lo - nlo) < 0.01 and abs(hi - nhi) < 0.01
    # rare: corpus prevalence ~0.1%, normal interval can leave [0, 1]; Wilson cannot
    f0 = [0] * n
    y0 = {i: int(i % 1000 == 0) for i in aud}
    lo, hi = E.ipw_audit_wilson(f0, aud, y0, pi)
    assert 0 <= lo <= hi <= 1
    blo, bhi = E.ipw_audit_bootstrap(f, aud, ys, pi, random.Random(1), reps=200)
    assert blo < est.value < bhi


def test_neyman_total_hits_target_half_width_with_fpc():
    # Neyman allocation at the returned n must give exactly the target half-width from the closed-form variance
    # sum_h W_h^2 (1 - n_h/N_h) S_h^2 / n_h (regression: milestones 6a-6e squared S_h^2 in the fpc term).
    import math
    sizes, s2 = [15000, 11000, 7000, 10000], [0.22, 0.19, 0.29, 0.17]
    big = sum(sizes)
    for half in (0.03, 0.01, 0.005):
        n = E.neyman_total(sizes, s2, half)
        ws = [N / big * math.sqrt(v) for N, v in zip(sizes, s2)]
        nh = [n * x / sum(ws) for x in ws]
        var = sum((N / big) ** 2 * (1 - k / N) * v / k for N, k, v in zip(sizes, nh, s2))
        assert abs(E.Z95 * math.sqrt(var) - half) < 1e-9


def test_ppi_ols_matches_closed_form_and_perfect_coder():
    import numpy as np
    from llmci import regression as R
    rng = np.random.default_rng(3)
    N = 2000
    X = np.column_stack([np.ones(N), rng.integers(0, 2, N)])
    y = (rng.random(N) < 0.3 + 0.2 * X[:, 1]).astype(float)
    idx = rng.choice(N, 200, replace=False)
    b, se = R.ppi_ols(X, y.copy(), idx, y[idx])  # perfect coder: no rectifier, zero variance
    assert np.allclose(b, R.ols(X, y)) and np.allclose(se, 0)
    f = 1 - y  # all wrong: PPI still recovers the truth from the audit's rectifier
    b2, _ = R.ppi_ols(X, f, np.arange(N), y)  # audit = whole corpus
    assert np.allclose(b2, R.ols(X, y))


def test_ppi_ols_lam_endpoints_and_tuned_never_wider_than_human_only():
    import numpy as np
    from llmci import regression as R
    rng = np.random.default_rng(5)
    N = 3000
    X = np.column_stack([np.ones(N), rng.integers(0, 2, N)])
    y = (rng.random(N) < 0.3 + 0.2 * X[:, 1]).astype(float)
    f = np.where(rng.random(N) < 0.8, y, 1 - y)
    idx = rng.choice(N, 300, replace=False)
    b0, psi0 = R.ppi_ols_lam(X, f, idx, y[idx], 0.0)
    bh, seh = R.human_ols(X[idx], y[idx], N)
    assert np.allclose(b0, bh)
    assert np.allclose(np.sqrt(psi0.var(axis=0, ddof=1) * (1 - 300 / N) / 300), seh, rtol=0.02)
    b1, _ = R.ppi_ols_lam(X, f, idx, y[idx], 1.0)
    assert np.allclose(b1, R.ppi_ols(X, f, idx, y[idx])[0])
    bt, st, lams = R.ppi_ols_tuned(X, f, idx, y[idx])
    assert np.all(st <= seh * 1.02) and np.all((0 <= lams) & (lams <= 1))
    bp, _, _ = R.ppi_ols_tuned(X, y.copy(), np.arange(N), y)  # audit = corpus, perfect coder
    assert np.allclose(bp, R.ols(X, y))


def test_ppi_ols_crossfit_is_unbiased_and_covers_on_synthetic_data():
    import numpy as np
    from llmci import regression as R
    rng = np.random.default_rng(11)
    N = 4000
    X = np.column_stack([np.ones(N), rng.integers(0, 2, N)])
    y = (rng.random(N) < 0.3 + 0.2 * X[:, 1]).astype(float)
    f = np.where(rng.random(N) < 0.85, y, 1 - y)
    truth = R.ols(X, y)
    cover, errs = 0, []
    for _ in range(200):
        idx = rng.choice(N, 300, replace=False)
        b, se, lam = R.ppi_ols_crossfit(X, f, idx, y[idx], rng.permutation(300))
        assert np.all((0 <= lam) & (lam <= 1))
        cover += abs(b[1] - truth[1]) <= 1.96 * se[1]
        errs.append(b[1] - truth[1])
    assert 0.90 <= cover / 200 <= 0.99 and abs(np.mean(errs)) < 0.01


def test_stratified_ppi_tuned_endpoints_and_oracle_variance():
    rng = random.Random(7)
    y, f = corpus(400, 0.3, 0.8, 0.9, rng)
    idx = rng.sample(range(400), 80)
    s = [(400, f, [y[i] for i in idx], [f[i] for i in idx])]
    a, b = E.stratified_ppi_tuned(s, lam=1.0), E.stratified_ppi(s)
    assert math.isclose(a.value, b.value) and math.isclose(a.se, b.se)
    h = E.stratified_ppi_tuned(s, lam=0.0)
    assert math.isclose(h.se, E.stratified_human([(400, [y[i] for i in idx])]).se)
    lam, s2 = E.stratum_lambda_s2(y, f)
    assert 0 <= lam <= 1
    # the oracle weight never has more residual variance than either endpoint
    assert s2 <= E._var(y) + 1e-12 and s2 <= E._var([a_ - b_ for a_, b_ in zip(y, f)]) + 1e-12
    assert E.stratum_lambda_s2(y, [1] * 400) == (0.0, E._var(y))


def test_stratified_ppi_tuned_unbiased_and_covers():
    rng = random.Random(11)
    y, f = corpus(600, 0.25, 0.7, 0.85, rng)
    truth = sum(y) / 600
    vals, cov = [], 0
    for _ in range(1500):
        idx = rng.sample(range(600), 100)
        e = E.stratified_ppi_tuned([(600, f, [y[i] for i in idx], [f[i] for i in idx])])
        vals.append(e.value)
        cov += E.covers(e, truth)
    assert abs(sum(vals) / len(vals) - truth) < 0.004
    assert 0.92 < cov / 1500 < 0.975


def test_informedness_known_values_and_degenerate_pilots():
    from llmci import audit_design as S
    y = [1, 1, 1, 1, 0, 0, 0, 0]
    assert S.informedness(y, y) == 1.0
    assert S.informedness(y, [1] * 8) == 0.0  # sens 1, spec 0
    assert math.isclose(S.informedness(y, [1, 1, 1, 0, 0, 0, 0, 1]), 0.75 + 0.75 - 1)
    assert S.informedness([1, 1], [1, 1]) == 0.0 and S.informedness([0, 0], [0, 0]) == 0.0


def test_screen_needs_both_informedness_and_enough_positives():
    from llmci import audit_design as S
    rng = random.Random(3)
    y, f = corpus(400, 0.3, 0.9, 0.95, rng)  # about 120 positives, J about 0.85
    assert S.screen(y, f) == "cells"
    assert S.screen(y, [rng.randint(0, 1) for _ in y]) == "pooled"  # empty coder
    rare = [1] * 10 + [0] * 110
    assert S.screen(rare, rare) == "pooled"  # perfect coder: no coder-negative positives, so neg_guard keeps it pooled
    assert S.screen(rare, rare, tau=S.TAU_6AM, guard=S.GUARD_6AM, neg_guard=0) == "pooled"  # 10 < 20 positives (6al)
    assert S.screen(rare, rare, guard=10, neg_guard=0) == "cells"


def test_neg_guard_pools_when_the_coder_negative_cell_has_no_positives():
    from llmci import audit_design as S
    y = [1] * 12 + [0] * 108
    f_miss = [1] * 12 + [0] * 108  # perfect: no positive in the coder-negative cell
    f_some = [1] * 9 + [0] * 3 + [0] * 108  # three positives coded 0
    assert S.screen(y, f_miss, guard=10, neg_guard=0) == "cells" and S.screen(y, f_miss, guard=10) == "pooled" and S.screen(y, f_miss, guard=10, neg_guard=S.NEG_GUARD) == "pooled"
    assert S.screen(y, f_some, guard=10, neg_guard=S.NEG_GUARD) == "cells"
    assert S.screen(y, f_some, guard=10, neg_guard=4) == "pooled"
    rng = random.Random(9)
    yy, ff = corpus(2000, 0.05, 0.99, 0.95, rng)
    pil = {i: yy[i] for i in rng.sample(range(2000), 100)}
    k = sum(1 for i, v in pil.items() if v and not ff[i])
    d = S.plan_audit(ff, pil, 200, tau=0.0, guard=0, neg_guard=S.NEG_GUARD)["design"]
    assert d == ("cells" if k >= S.NEG_GUARD else "pooled")


def test_cell_allocation_sums_to_budget_respects_floor_and_caps():
    from llmci import audit_design as S
    a = S.cell_allocation(400, [900, 300], [0.01, 0.20])
    assert sum(a) == 400 and min(a) >= 140  # floor 0.35 * 400
    assert S.cell_allocation(400, [900, 300], [0.01, 0.20], floor=0.0)[1] > a[1] - 1  # Neyman alone favours the noisy cell
    assert S.cell_allocation(400, [30, 970], [0.2, 0.2])[0] == 30  # capped at the cell size


def test_plan_audit_pools_for_an_empty_coder_and_splits_for_a_good_one():
    from llmci import audit_design as S
    rng = random.Random(5)
    y, f = corpus(3000, 0.3, 0.9, 0.95, rng)
    pilot = rng.sample(range(3000), 120)
    plan = S.plan_audit(f, {i: y[i] for i in pilot}, 400)
    assert plan["design"] == "cells" and len(plan["cells"]) == 2
    assert sum(plan["to_label"]) + 120 >= 400 - 2 and all(t >= 0 for t in plan["to_label"])
    assert sorted(i for c in plan["cells"] for i in c) == list(range(3000))
    noise = [rng.randint(0, 1) for _ in y]
    plan = S.plan_audit(noise, {i: y[i] for i in pilot}, 400)
    assert plan["design"] == "pooled" and plan["to_label"] == [280]


def test_audit_interval_matches_the_experiment_estimator_and_covers():
    from llmci import audit_design as S
    rng = random.Random(11)
    y, f = corpus(3000, 0.3, 0.9, 0.95, rng)
    pilot = rng.sample(range(3000), 120)
    plan = S.plan_audit(f, {i: y[i] for i in pilot}, 400)
    labels = {i: y[i] for i in pilot}
    for c, t in zip(plan["cells"], plan["to_label"]):
        rest = [i for i in c if i not in labels]
        for i in rng.sample(rest, t):
            labels[i] = y[i]
    est, lo, hi = S.audit_interval(plan, f, labels)
    strata = [(len(c), [f[i] for i in c], [labels[i] for i in c if i in labels], [f[i] for i in c if i in labels]) for c in plan["cells"]]
    ys = [v for s in strata for v in s[2]]
    fs = [v for s in strata for v in s[3]]
    lam = min(1.0, max(0.0, E._cov(ys, fs) / E._var(fs)))
    e = E.stratified_ppi_tuned(strata, lam)  # the library's own stratified estimator with the pooled weight fixed
    n_eff = e.value * (1 - e.value) / e.se ** 2
    d = 1 + E.Z95 ** 2 / n_eff
    half = E.Z95 * math.sqrt(e.value * (1 - e.value) / n_eff + E.Z95 ** 2 / (4 * n_eff ** 2)) / d
    mid = (e.value + E.Z95 ** 2 / (2 * n_eff)) / d
    assert abs(est - e.value) < 1e-9 and abs(lo - (mid - half)) < 1e-6 and abs(hi - (mid + half)) < 1e-6
    assert lo < sum(y) / len(y) < hi


def test_cell_ceiling_is_prevalence_free_and_matches_neyman_arithmetic():
    from llmci import audit_design as S
    # sens = spec = (1 + J) / 2 gives sqrt(1 - J^2); LOG.md 7i quotes 0.917 at J 0.4 and 0.600 at J 0.8
    assert abs(S.cell_ceiling(0.7, 0.7) - math.sqrt(1 - 0.4 ** 2)) < 1e-12
    assert abs(S.cell_ceiling(0.9, 0.9) - 0.6) < 1e-12
    assert abs(S.cell_ceiling(0.8, 0.97) - 0.595) < 1e-3 and abs(S.cell_ceiling(0.5, 0.97) - 0.819) < 1e-3
    assert abs(S.cell_ceiling(0.6, 0.4) - 1.0) < 1e-12  # J = 0: cells cannot help
    # the Neyman arithmetic at three prevalences gives the same ratio
    for p in (0.02, 0.1, 0.4):
        s, c = 0.8, 0.9
        wp = p * s + (1 - p) * (1 - c)
        pp, pn = p * s / wp, p * (1 - s) / (1 - wp)
        r = math.sqrt((wp * math.sqrt(pp * (1 - pp)) + (1 - wp) * math.sqrt(pn * (1 - pn))) ** 2 / (p * (1 - p)))
        assert abs(r - S.cell_ceiling(s, c)) < 1e-12
    assert S.pilot_ceiling([1, 1, 1], [1, 0, 1]) == 1.0  # no negative in the pilot


def test_plan_audit_reports_the_ceiling():
    from llmci import audit_design as S
    rng = random.Random(5)
    y, f = corpus(3000, 0.3, 0.9, 0.95, rng)
    pilot = rng.sample(range(3000), 120)
    plan = S.plan_audit(f, {i: y[i] for i in pilot}, 400)
    assert plan["design"] == "cells" and 0.4 < plan["ceiling"] < 0.7  # sens .9 spec .95: 0.52 exact
    noise = [rng.randint(0, 1) for _ in y]
    assert S.plan_audit(noise, {i: y[i] for i in pilot}, 400)["ceiling"] > 0.9


def test_guard_fire_probability_matches_brute_force_and_poisson_limit():
    import itertools, math
    from llmci import audit_design as S
    # brute force: corpus of 9 items, 4 misses, pilot 5, at least 3 misses in the pilot
    hits = sum(1 for c in itertools.combinations(range(9), 5) if sum(1 for i in c if i < 4) >= 3)
    assert abs(S.guard_fire_probability(5, 4, 9) - hits / math.comb(9, 5)) < 1e-12
    assert S.guard_fire_probability(5, 2, 9) == 0.0 and S.guard_fire_probability(9, 4, 9) == 1.0
    # large corpus, small sampling fraction: Poisson(m = 5.32) tail is 0.90
    m = 5.3223
    pois = 1 - math.exp(-m) * (1 + m + m * m / 2)
    assert abs(pois - 0.9) < 1e-3
    assert abs(S.guard_fire_probability(5322, 1000, 1_000_000) - pois) < 2e-3


def test_pilot_for_guard_is_the_smallest_pilot_reaching_the_target():
    from llmci import audit_design as S
    p = S.pilot_for_guard(0.02, 0.5, 100_000)
    misses = round(100_000 * 0.02 * 0.5)
    assert S.guard_fire_probability(p, misses, 100_000) >= 0.9 > S.guard_fire_probability(p - 1, misses, 100_000)
    assert abs(p - 5.32 / (0.02 * 0.5)) < 15  # the Poisson planning rule
    assert S.pilot_for_guard(0.0001, 0.9, 1000) is None


def test_cells_probability_matches_brute_force_screen():
    import itertools
    from llmci import audit_design as S
    # corpus of 12: 2 hits, 4 misses, 3 false positives, 3 true negatives; every 6-item pilot through the real screen
    y = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    f = [1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0]
    combos = list(itertools.combinations(range(12), 6))
    hits = sum(1 for c in combos if S.screen([y[i] for i in c], [f[i] for i in c], tau=0.0, guard=0) == "cells")
    assert abs(S.cells_probability(6, 2, 4, 3, 12) - hits / len(combos)) < 1e-12
    # never above the guard-only tail, and equal to it when hits are plentiful
    assert S.cells_probability(6, 2, 4, 3, 12) <= S.guard_fire_probability(6, 4, 12) + 1e-12
    assert abs(S.cells_probability(400, 2000, 60, 50, 10000) - S.guard_fire_probability(400, 60, 10000)) < 1e-6


def test_cells_probability_tau_matches_brute_force_screen():
    import itertools
    from llmci import audit_design as S
    y = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
    f = [1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0]
    for pilot in (5, 7):
        combos = list(itertools.combinations(range(13), pilot))
        for tau in (0.0, 0.05, 0.1, 0.2, 0.25, 0.5, 1.0):
            for ng in (0, 1, 3):
                hits = sum(1 for c in combos
                           if S.screen([y[i] for i in c], [f[i] for i in c], tau=tau, guard=0, neg_guard=ng) == "cells")
                assert abs(S.cells_probability(pilot, 3, 3, 3, 13, neg_guard=ng, tau=tau) - hits / len(combos)) < 1e-12
    # a higher tau never raises the share
    assert S.cells_probability(600, 120, 80, 3000, 30000, tau=0.2) <= S.cells_probability(600, 120, 80, 3000, 30000)


def test_default_screen_admits_a_rare_informative_coder_the_6am_screen_refused():
    # LOG.md 7ai: at 1% prevalence a pilot holds about 11 positives, so guard 20 sent every draw to pooled; the
    # default since 7ai (tau 0.1, guard 0, neg_guard 3) admits a coder that finds some positives and misses 3 or more
    from llmci import audit_design as S
    assert (S.TAU, S.GUARD, S.NEG_GUARD) == (0.1, 0, 3)
    y = [1] * 11 + [0] * 989
    f = [1] * 5 + [0] * 6 + [1] * 20 + [0] * 969  # sens 5/11, spec 969/989: J about 0.43
    assert S.screen(y, f) == "cells"
    assert S.screen(y, f, tau=S.TAU_6AM, guard=S.GUARD_6AM) == "pooled"
    weak = [1] * 1 + [0] * 10 + [1] * 60 + [0] * 929  # sens 1/11, spec 929/989: J about 0.03
    assert S.screen(y, weak) == "pooled"
    plan = S.plan_audit(f, {i: y[i] for i in range(1000)}, 2000)
    assert plan["design"] == "cells"


def test_predicted_ratio_prices_floor_lambda_and_fpc():
    # LOG.md 7ak: predicted_ratio = sqrt(var_cells / var_pooled) at the planned sizes, pooled at the pilot's fitted
    # lambda, cells at the floored allocation, both with the finite-population correction
    from llmci import audit_design as S
    rng = random.Random(3)
    N, n = 4000, 800
    y = [int(rng.random() < 0.1) for _ in range(N)]
    good = [a if rng.random() < 0.9 else 1 - a for a in y]  # sens 0.9, spec 0.9
    noise = [int(rng.random() < 0.1) for _ in range(N)]  # independent of y
    pilot = {i: y[i] for i in rng.sample(range(N), 400)}
    # brute-force arithmetic for the good coder
    idx = sorted(pilot); ys = [pilot[i] for i in idx]; fs = [good[i] for i in idx]; m = len(idx)
    my, mf = sum(ys) / m, sum(fs) / m
    lam = min(1.0, max(0.0, sum((a - my) * (b - mf) for a, b in zip(ys, fs)) / (m - 1)
                       / (sum((b - mf) ** 2 for b in fs) / (m - 1))))
    r = [a - lam * b for a, b in zip(ys, fs)]; mr = sum(r) / m
    vp = (1 - n / N) * sum((x - mr) ** 2 for x in r) / (m - 1) / n
    cells = [[i for i in range(N) if good[i] == k] for k in (0, 1)]
    s2 = S._cell_s2(good, pilot, cells)
    al = S.cell_allocation(n, [len(c) for c in cells], s2)
    vc = sum((len(c) / N) ** 2 * (1 - a / len(c)) * v / a for c, a, v in zip(cells, al, s2))
    assert abs(S.predicted_ratio(good, pilot, n) - (vc / vp) ** 0.5) < 1e-12
    assert S.predicted_ratio(good, pilot, n) < 0.9
    assert S.predicted_ratio(noise, pilot, n) > 1.0  # no variance to save, the floor still costs
    assert S.predicted_ratio(good, {0: 1, 1: 0}, n) == 1.0  # too small a pilot to say


def test_width_margin_sends_a_costly_plan_to_pooled_and_defaults_to_zero():
    from llmci import audit_design as S
    rng = random.Random(5)
    N, n = 4000, 800
    y = [int(rng.random() < 0.1) for _ in range(N)]
    good = [a if rng.random() < 0.9 else 1 - a for a in y]
    pilot = {i: y[i] for i in rng.sample(range(N), 400)}
    assert S.WIDTH_MARGIN == 0.0  # the default since 7ak
    base = S.plan_audit(good, pilot, n)
    assert base == S.plan_audit(good, pilot, n, width_margin=None)  # a coder that pays: the margin changes nothing
    assert base["design"] == "cells"
    pr = S.predicted_ratio(good, pilot, n)
    assert S.plan_audit(good, pilot, n, width_margin=0.0)["design"] == "cells"
    assert S.plan_audit(good, pilot, n, width_margin=1 - pr + 1e-9)["design"] == "pooled"
    noise = [int(rng.random() < 0.1) for _ in range(N)]  # carries no information: the floor makes cells cost
    assert S.predicted_ratio(noise, pilot, n) > 1.0
    open_screen = dict(tau=-1.0, neg_guard=0)  # a screen that admits every coder, so only the margin decides
    assert S.plan_audit(noise, pilot, n, **open_screen)["design"] == "pooled"
    assert S.plan_audit(noise, pilot, n, width_margin=None, **open_screen)["design"] == "cells"


def test_pseudo_floor_widens_only_a_thin_coder_negative_cell():
    # LOG.md 7am: pseudo_var is p~(1 - p~), p~ = (k + a) / (m + 2a); 0 with a = 0. It floors a coder cell whose audit
    # holds no positive, leaves a cell with plenty untouched, and never touches a pooled plan.
    from llmci import audit_design as S
    assert S.pseudo_var([0] * 98, 0) == 0.0
    assert abs(S.pseudo_var([0] * 98, 1.0) - (1 / 100) * (99 / 100)) < 1e-15
    assert abs(S.pseudo_var([1] * 2 + [0] * 98, 2.0) - (4 / 104) * (100 / 104)) < 1e-15
    N = 2000
    f = [1] * 200 + [0] * 1800
    h = [1] * 120 + [0] * 80 + [0] * 1800  # coder-negative cell holds no positive at all
    plan = {"design": "cells", "cells": [list(range(200, N)), list(range(200))]}
    labels = {i: h[i] for i in list(range(0, 200, 2)) + list(range(200, N, 9))}
    _, lo0, hi0 = S.audit_interval(dict(plan, pseudo=0.0), f, labels)
    _, lo2, hi2 = S.audit_interval(dict(plan, pseudo=2.0), f, labels)
    assert hi2 - lo2 > hi0 - lo0
    pooled = {"design": "pooled", "cells": [list(range(N))], "pseudo": 2.0}
    assert S.audit_interval(pooled, f, labels) == S.audit_interval(dict(pooled, pseudo=0.0), f, labels)
    pilot = {i: h[i] for i in range(0, N, 4)}
    assert S.plan_audit(f, pilot, 400, neg_guard=0)["pseudo"] == S.PSEUDO


def test_guard_first_fallback_only_replans_a_pilot_the_miss_guard_refuses():
    # LOG.md 7an: fallback_pseudo leaves a pilot with >= neg_guard coder misses planned exactly as before, and replans
    # one with fewer at neg_guard 0 and that pseudo floor (flagged "fallback"); the default (None) changes nothing.
    from llmci import audit_design as S
    assert S.FALLBACK_PSEUDO is None
    rng = random.Random(11)
    N, n = 4000, 600
    y = [int(rng.random() < 0.06) for _ in range(N)]
    sharp = [a if rng.random() < 0.985 else 1 - a for a in y]  # misses few positives: thin pilots fail the guard
    pilot = {i: y[i] for i in rng.sample(range(N), 300)}
    misses = sum(1 for i in pilot if pilot[i] and not sharp[i])
    assert misses < S.NEG_GUARD
    assert S.plan_audit(sharp, pilot, n)["design"] == "pooled"
    fb = S.plan_audit(sharp, pilot, n, fallback_pseudo=2.0)
    assert fb.pop("fallback") is True
    assert fb == S.plan_audit(sharp, pilot, n, neg_guard=0, pseudo=2.0)
    assert fb["design"] == "cells" and fb["pseudo"] == 2.0
    loose = [a if rng.random() < 0.8 else 1 - a for a in y]  # misses plenty: the guard passes, the fallback is idle
    assert sum(1 for i in pilot if pilot[i] and not loose[i]) >= S.NEG_GUARD
    assert S.plan_audit(loose, pilot, n, fallback_pseudo=2.0) == S.plan_audit(loose, pilot, n)
    assert S.plan_audit(sharp, pilot, n, neg_guard=0, fallback_pseudo=2.0) == S.plan_audit(sharp, pilot, n, neg_guard=0)


def test_two_phase_counts_the_pilot_exactly_and_estimates_only_the_rest():
    # LOG.md 7ao: a two-phase cells plan labels fresh items only, sized by `two_phase_allocation` over each cell's
    # unpiloted rest; its interval sums the pilot labels as known, so with the whole rest labelled it is exact.
    from llmci import audit_design as S
    assert S.FALLBACK_TWO_PHASE is False
    rng = random.Random(12)
    N, n = 3000, 800
    y = [int(rng.random() < 0.08) for _ in range(N)]
    f = [a if rng.random() < 0.9 else 1 - a for a in y]
    pilot = {i: y[i] for i in rng.sample(range(N), 400)}
    plan = S.plan_audit(f, pilot, n, neg_guard=0, pseudo=2.0, two_phase=True, width_margin=None)
    assert plan["design"] == "cells" and plan["two_phase"] and plan["pilot"] == sorted(pilot)
    assert sum(plan["to_label"]) == n - len(pilot)
    rest = [sum(1 for i in c if i not in pilot) for c in plan["cells"]]
    assert all(t <= r for t, r in zip(plan["to_label"], rest))
    full = dict(pilot); full.update({i: y[i] for i in range(N)})
    est, lo, hi = S.audit_interval(plan, f, full)
    assert abs(est - sum(y) / N) < 1e-12 and hi - lo < 1e-3  # FPC: nothing left to estimate
    # a partial second phase: unbiased for the rest, pilot labels enter only as known counts
    labels = dict(pilot)
    for c, t in zip(plan["cells"], plan["to_label"]):
        for i in rng.sample([i for i in c if i not in pilot], t):
            labels[i] = y[i]
    est, lo, hi = S.audit_interval(plan, f, labels)
    known = sum(pilot.values())
    hand = known
    for c in plan["cells"]:
        y2 = [labels[i] for i in c if i in labels and i not in pilot]
        hand += sum(1 for i in c if i not in pilot) * sum(y2) / len(y2)
    assert abs(est - hand / N) < 1e-12 and lo < est < hi
    # the forecast prices the design: two-phase discards the pilot from the rest's estimate, so it is no narrower
    assert S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True) >= S.predicted_ratio(f, pilot, n, pseudo=2.0)


def test_fallback_two_phase_applies_only_to_the_fallback_plan():
    from llmci import audit_design as S
    rng = random.Random(11)
    N, n = 4000, 600
    y = [int(rng.random() < 0.06) for _ in range(N)]
    sharp = [a if rng.random() < 0.985 else 1 - a for a in y]
    pilot = {i: y[i] for i in rng.sample(range(N), 300)}
    fb = S.plan_audit(sharp, pilot, n, fallback_pseudo=2.0, fallback_two_phase=True)
    assert fb.pop("fallback") is True
    assert fb == S.plan_audit(sharp, pilot, n, neg_guard=0, pseudo=2.0, two_phase=True)
    loose = [a if rng.random() < 0.8 else 1 - a for a in y]
    assert S.plan_audit(loose, pilot, n, fallback_pseudo=2.0, fallback_two_phase=True) == S.plan_audit(loose, pilot, n)


def test_neg_only_two_phase_reuses_the_coder_positive_pilot_and_is_exact_on_a_census():
    # LOG.md 7ap: two_phase="neg" makes only the coder-negative cell two-phase; the coder-positive cell's pilot labels
    # and its fresh ones estimate its whole mean together, so the plan labels fewer fresh items there than full two-phase
    from llmci import audit_design as S
    assert S.PRICE_FLOOR is False
    rng = random.Random(21)
    N, n = 3000, 800
    y = [int(rng.random() < 0.08) for _ in range(N)]
    f = [a if rng.random() < 0.9 else 1 - a for a in y]
    pilot = {i: y[i] for i in rng.sample(range(N), 400)}
    plan = S.plan_audit(f, pilot, n, neg_guard=0, pseudo=2.0, two_phase="neg", width_margin=None)
    assert plan["design"] == "cells" and plan["phase2"] == [True, False]
    assert sum(plan["to_label"]) == n - len(pilot)
    full = dict(pilot); full.update({i: y[i] for i in range(N)})
    est, lo, hi = S.audit_interval(plan, f, full)
    assert abs(est - sum(y) / N) < 1e-12 and hi - lo < 1e-3
    labels = dict(pilot)
    for c, t in zip(plan["cells"], plan["to_label"]):
        for i in rng.sample([i for i in c if i not in pilot], t):
            labels[i] = y[i]
    est, lo, hi = S.audit_interval(plan, f, labels)
    c0, c1 = plan["cells"]
    y2 = [labels[i] for i in c0 if i in labels and i not in pilot]
    ya = [labels[i] for i in c1 if i in labels]
    hand = sum(pilot[i] for i in c0 if i in pilot) + sum(1 for i in c0 if i not in pilot) * sum(y2) / len(y2)
    hand += len(c1) * sum(ya) / len(ya)
    assert abs(est - hand / N) < 1e-12 and lo < est < hi
    # keeping the coder-positive pilot can only help the forecast
    assert S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase="neg") <= \
        S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True, price_floor=False) + 0.02


def test_priced_floor_raises_the_forecast_when_the_second_phase_is_small():
    # LOG.md 7ap: with a near-empty coder-negative cell in the pilot, the plus-four floor at the second-phase size is
    # larger than at the pilot size, so the priced forecast is wider; with pseudo 0 pricing changes nothing
    from llmci import audit_design as S
    rng = random.Random(5)
    N, n = 4000, 600
    y = [int(rng.random() < 0.06) for _ in range(N)]
    f = [a if (a and rng.random() < 0.97) or (not a and rng.random() < 0.97) else 1 - a for a in y]
    pilot = {i: y[i] for i in rng.sample(range(N), 300)}
    plain = S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True)
    priced = S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True, price_floor=True)
    assert priced >= plain - 1e-9
    cells = [[i for i, c in enumerate(f) if c == k] for k in (0, 1)]
    s2 = [0.01, 0.2]
    d0 = S.priced_two_phase(n, cells, pilot, s2, pseudo=0.0)
    rest, k = S.two_phase_allocation(n, cells, pilot, s2)
    assert d0["to_label"] == k
    # the plan built with pricing on matches the forecast's design
    plan = S.plan_audit(f, pilot, n, neg_guard=0, pseudo=2.0, two_phase=True, price_floor=True, width_margin=None)
    if plan["design"] == "cells":
        assert sum(plan["to_label"]) == n - len(pilot)


def test_no_info_sends_an_unreadable_pilot_to_pooled():
    # LOG.md 7ap (post hoc): a pilot whose only positive the coder also labelled 1 has lambda 1 and every pooled
    # residual 0, so `predicted_ratio` cannot forecast; its default 1.0 passes the margin-0 gate and the fallback
    # opened cells at 3 times the pooled width. no_info=inf refuses it; the default keeps every earlier replay.
    from llmci import audit_design as S
    rng = random.Random(3)
    N, n = 6000, 500
    y = [int(rng.random() < 0.012) for _ in range(N)]
    f = [a if rng.random() < 0.99 else 0 for a in y]
    pos1 = next(i for i in range(N) if y[i] and f[i])
    negs = [i for i in range(N) if not y[i] and not f[i]]
    pilot = {i: 0 for i in rng.sample(negs, 249)}
    pilot[pos1] = 1
    assert S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True, price_floor=True) == 1.0
    assert S.predicted_ratio(f, pilot, n, pseudo=2.0, two_phase=True, price_floor=True, no_info=float("inf")) == \
        float("inf")
    kw = dict(fallback_pseudo=2.0, fallback_two_phase=True, price_floor=True, width_margin=0.0)
    assert S.plan_audit(f, pilot, n, **kw)["design"] == "cells"
    assert S.plan_audit(f, pilot, n, no_info=float("inf"), **kw)["design"] == "pooled"


def test_budget_cap_keeps_cells_plan_within_n():
    """LOG.md 7ar: a pilot that holds more of one coder cell than its Neyman allocation made an uncapped cells plan
    label more than n items; budget_cap=True keeps the total at n and leaves an in-budget plan unchanged."""
    from llmci import audit_design as A
    assert A.cap_to_budget([10, 5], 20) == [10, 5]
    assert A.cap_to_budget([30, 0], 20) == [20, 0]
    assert sum(A.cap_to_budget([7, 7, 7], 10)) == 10
    assert A.cap_to_budget([5, 5], -3) == [0, 0]
    rng = random.Random(3)
    N, n = 4000, 400
    h = [1 if rng.random() < 0.3 else 0 for _ in range(N)]
    f = [y if rng.random() < 0.85 else 1 - y for y in h]
    over = 0
    for seed in range(40):
        pilot = random.Random(seed).sample(range(N), 280)
        lab = {i: h[i] for i in pilot}
        kw = dict(tau=A.TAU, guard=0, neg_guard=3, width_margin=None, pseudo=0.0, fallback_pseudo=None)
        loose = A.plan_audit_pre7ar(f, lab, n, **kw)
        tight = A.plan_audit(f, lab, n, **kw)  # BUDGET_CAP is on by default since 7ar
        assert loose["design"] == tight["design"] == "cells"
        assert len(lab) + sum(tight["to_label"]) <= n
        over += len(lab) + sum(loose["to_label"]) > n
        if len(lab) + sum(loose["to_label"]) <= n:
            assert loose["to_label"] == tight["to_label"]
    assert over > 0  # the uncapped plan does overspend at a 0.7n pilot here


def test_post_stratified_estimate_equals_pooled_control_variate():
    """LOG.md 7as: on the same simple random sample, the cells (post-stratified) estimate equals the pooled
    control-variate estimate exactly. With a 0/1 coder code, the regression of y on f passes through both cell means, so
    the regression estimator is the post-stratified one (when lambda is not clipped). A pilot of the whole audit
    therefore buys nothing: the cells design gains only through the Neyman allocation of the unpiloted labels."""
    from llmci import audit_design as A
    rng = random.Random(1)
    N = 5000
    f = [int(rng.random() < 0.1) for _ in range(N)]
    h = [int(rng.random() < (0.6 if x else 0.03)) for x in f]
    cells = {"design": "cells", "cells": [[i for i in range(N) if f[i] == k] for k in (0, 1)], "pseudo": 0.0}
    pooled = {"design": "pooled", "cells": [list(range(N))]}
    for seed in range(20):
        lab = {i: h[i] for i in random.Random(seed).sample(range(N), 500)}
        assert abs(A.audit_interval(cells, f, lab)[0] - A.audit_interval(pooled, f, lab)[0]) < 1e-12


def test_j_lower_bound_of_7at():
    """LOG.md 7at: the l-rules' Wald lower bound on Youden's J equals informedness at z = 0, falls as z grows, and is
    -1 when the pilot has no positive (J undefined), so such a pilot is never admitted."""
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    from llmci import audit_design as A
    import h7at_weak_admit as W
    rng = random.Random(3)
    y = [int(rng.random() < 0.2) for _ in range(400)]
    f = [int(rng.random() < (0.7 if t else 0.1)) for t in y]
    assert abs(W.j_lower(y, f, 0.0) - A.informedness(y, f)) < 1e-12
    assert W.j_lower(y, f, 1.645) < W.j_lower(y, f, 1.0) < W.j_lower(y, f, 0.0)
    assert W.j_lower([0] * 50, [1] * 5 + [0] * 45, 1.0) == -1.0


def test_rare_fallback_is_wilson_on_the_labels_and_defaults_to_three():
    """LOG.md 7av: rare_fallback=m closes a pooled plan with under m audited positives by a Wilson interval on the
    labels alone. LOG.md 7aw: the default is m = RARE_FALLBACK = 3; None gives the bare control-variate interval."""
    import importlib.util
    # a private copy: experiment modules imported by other tests set the shared module's RARE_FALLBACK to None
    spec = importlib.util.spec_from_file_location("audit_design_fresh", Path(__file__).resolve().parent / "llmci" / "audit_design.py")
    S = importlib.util.module_from_spec(spec); spec.loader.exec_module(S)
    assert S.RARE_FALLBACK == 3
    rng = random.Random(7)
    y, f = corpus(4000, 0.003, 0.6, 0.97, rng)
    plan = {"design": "pooled", "cells": [list(range(4000))]}
    z, fired = 1.959964, 0
    for seed in range(30):
        aud = random.Random(seed).sample(range(4000), 400)
        labels = {i: y[i] for i in aud}
        x, a = sum(labels.values()), 400
        base = S.audit_interval(plan, f, labels, rare_fallback=None)
        assert S.audit_interval(plan, f, labels) == S.audit_interval(plan, f, labels, rare_fallback=3)
        if x >= 3:
            assert S.audit_interval(plan, f, labels) == base
        est, lo, hi = S.audit_interval(plan, f, labels, rare_fallback=5)
        assert est == base[0]
        if x < 5:
            fired += 1
            q = x / a
            mid = (q + z * z / (2 * a)) / (1 + z * z / a)
            half = z * math.sqrt(q * (1 - q) / a + z * z / (4 * a * a)) / (1 + z * z / a)
            assert abs(lo - max(0.0, mid - half)) < 1e-12 and abs(hi - (mid + half)) < 1e-12 and lo <= q <= hi
        else:
            assert (est, lo, hi) == base
    assert fired >= 10  # about 1.2 expected positives per audit, so the fallback is exercised


def test_neg_floor_default_is_the_7az_joint_trigger():
    """LOG.md 7az: plan_audit's default NEG_FLOOR = (5, 0.40, 2) marks a one-phase cells plan whose pilot holds fewer
    than 5 coder misses and has J_hat under 0.40, and audit_interval then floors the coder-negative cell at the
    plus-two pseudo-count variance; the result equals the experiment's p5j40 interval (`h7au_neg_floor.interval`)."""
    import importlib.util
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    import h7au_neg_floor as U
    # a private copy: experiment modules imported by other tests set the shared module's NEG_FLOOR to None
    spec = importlib.util.spec_from_file_location("audit_design_7az", Path(__file__).resolve().parent / "llmci" / "audit_design.py")
    S = importlib.util.module_from_spec(spec); spec.loader.exec_module(S)
    assert S.NEG_FLOOR == (5, 0.40, 2)
    rng = random.Random(11)
    y, f = corpus(6000, 0.02, 0.7, 0.7, rng)
    n, k, seen = 1000, 700, {"floored": 0, "cells": 0}
    for seed in range(80):
        aud = random.Random(seed).sample(range(6000), n)
        pilot = {i: y[i] for i in aud[:k]}
        plan = S.plan_audit(f, pilot, n, tau=0.10)
        if plan["design"] != "cells":
            assert "neg_pseudo" not in plan
            continue
        seen["cells"] += 1
        py, pf = [pilot[i] for i in sorted(pilot)], [f[i] for i in sorted(pilot)]
        on = sum(1 for a, b in zip(py, pf) if a and not b) < 5 and S.informedness(py, pf) < 0.40
        assert ("neg_pseudo" in plan) == on
        seen["floored"] += on
        labels = dict(pilot)
        sb = random.Random(1000 + seed)
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = y[i]
        lib = S.audit_interval(plan, f, labels)
        mine = U.interval(plan, f, labels, ("neg", "pseudo", 2) if on else None)
        assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12
        off = S.audit_interval({kk: v for kk, v in plan.items() if kk != "neg_pseudo"}, f, labels)
        assert (off[2] - off[1]) <= (lib[2] - lib[1]) + 1e-15
    assert seen["cells"] > 0 and 0 < seen["floored"] < seen["cells"], seen


def test_tested_second_phase_check_fires_only_on_excess_misses():
    """7bd: the tested modes equal the untouched interval unless 7bb's upper-tail test rejects, then the named action."""
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    from llmci import audit_design as AD
    saved = AD.RARE_FALLBACK, AD.NEG_FLOOR
    import h7bd_tested_check as D  # its imports pin the library defaults off; restored below
    import h7bb_second_phase as BB
    AD.RARE_FALLBACK, AD.NEG_FLOOR = saved
    rng = random.Random(7)
    f = [0] * 600 + [1] * 200
    c0, c1 = list(range(600)), list(range(600, 800))
    plan = {"design": "cells", "cells": [c0, c1]}
    pilot = set(c0[:300] + c1[:60])
    for excess, want in ((False, False), (True, True)):
        y = [0] * 800
        for i in c0[:300]:
            y[i] = int(rng.random() < 0.02)  # the pilot under-sees cell 0's misses
        for i in c0[300:360]:
            y[i] = int(rng.random() < (0.25 if excess else 0.02))
        for i in c1[:100]:
            y[i] = int(rng.random() < 0.7)
        labels = {i: y[i] for i in c0[:360] + c1[:100]}
        assert D.rejects(plan, labels, pilot, 0.10) == want
        base = D._INTERVAL(plan, f, labels, pilot, False, None)
        for mode, act in (("q10v2", "v2"), ("q10tp", "tp")):
            got = D.interval(plan, f, labels, pilot, False, mode)
            ref = D._INTERVAL(plan, f, labels, pilot, False, act) if want else base
            assert got == ref
    assert BB.upper_tail(60, 0.02, 0) == 1.0


def test_validity_frontier_reads_the_committed_summaries():
    """Section 6.1's table is parsed, not retyped: spot-check it against the LOG's stated outcomes."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "validity_frontier", Path(__file__).resolve().parent / "experiments" / "validity_frontier.py")
    vf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vf)
    rs = {(r["milestone"], r["rule"]): r for r in vf.rows()}
    assert len(rs) == 32
    assert math.isclose(rs[("7be", "jp40")]["kept"], 7.883 / 9.524) and rs[("7be", "jp40")]["fail"] == 4  # LOG 7be
    assert math.isclose(rs[("7az", "p5j40")]["kept"], 8.510 / 8.993)  # LOG 7az: 94.6% kept
    assert math.isclose(rs[("7au", "n2")]["kept"], 0.374, abs_tol=5e-4)  # LOG 7au: 37.4%
    assert rs[("7at", "l16")]["fail"] == 4 and rs[("7at", "l16")]["fail_ref"] == 7  # LOG 7at
    assert rs[("7bc", "rs10tp")]["fail"] == 0  # LOG 7bc: rs10tp lifts all 7
    # the headline: no candidate keeps 90% of the gain and repairs half the failing cells
    assert not [r for r in rs.values() if r["kept"] >= 0.90 and r["reach"] >= 0.5]


def test_abstract_numbers_are_in_the_result_files():
    """The paper's abstract quotes the library-era results (7al to 7be); each quoted figure must sit in the file that wrote it."""
    here = Path(__file__).resolve().parent
    text = (here / "paper" / "paper.md").read_text()
    abstract = text[text.index("## Abstract"):text.index("## 1 Introduction")]
    flat = " ".join(abstract.split())
    ex = here / "experiments"
    checks = [  # (phrase in the abstract, file, text that file must hold)
        ("never more than 0.1% wider", "h7al_heldout.txt", "P2 m=0 ratio <= 1.010 in every cell: yes (worst 1.001)"),
        ("covered 93.5% or more", "h7al_heldout.txt", "m=0 0.999 (17% cells, cov 93.5)"),
        ("on 18 fresh cells it covered 93.2% or more", "h7as_fresh_share.txt", "s70 0.977 (30% cells, cov 93.2)"),
        ("none of 32 pre-registered repairs", "validity_frontier.txt", "repairing half or more of the failing cells: 0 of 32"),
        ("covers 95.1% over the 90 weak-coder cells", "h7be_gated_design.txt", "pooledA admitted coverage, weak cells 95.1%"),
        ("90 weak-coder cells", "h7be_gated_design.txt", "90 weak J < 0.3"),
        ("590 of 78,966", "h7be_gated_design.txt", "of 78966 admitted draws"),
        ("repairs 7 of the 11 failing cells at 17% of the gain", "validity_frontier.txt",
         "7be design_change_at_low_J_hat jp40 157 7.883 9.524 0.828 4 11 0.636"),
    ]
    for phrase, name, held in checks:
        assert phrase in flat, phrase
        assert held in (ex / name).read_text(), (name, held)
    # 7 failing cells, 62.5 to 87.6% given the split, 590 admitted draws: from the frontier's list
    line = next(s for s in (ex / "validity_frontier.txt").read_text().splitlines() if s.startswith("cells failing under"))
    import re
    cells = re.findall(r"\((\d+) admitted, ([\d.]+)%\)", line)
    assert len(cells) == 7 and sum(int(a) for a, _ in cells) == 590
    covs = sorted(float(c) for _, c in cells)
    assert (covs[0], covs[-1]) == (62.5, 87.6) and "cover 62.5 to 87.6%" in flat
    assert math.isclose(1 - 0.828, 0.17, abs_tol=0.005)


def test_gated_design_two_phase_plan_stays_in_budget_and_reads_no_pilot_twice():
    """7be: the priced two-phase replan from a pilot labels at most n items and its interval counts the pilot exactly."""
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    from llmci import audit_design as AD
    saved = AD.RARE_FALLBACK, AD.NEG_FLOOR
    import h7be_gated_design as G  # its imports pin the library defaults off; restored below
    AD.RARE_FALLBACK, AD.NEG_FLOOR = saved
    rng = random.Random(11)
    f = [0] * 3000 + [1] * 1000
    h = [int(rng.random() < 0.06) for _ in range(3000)] + [int(rng.random() < 0.5) for _ in range(1000)]
    n = 600
    pilot = rng.sample(range(4000), 420)
    pilot_y = {i: h[i] for i in pilot}
    for margin in (0.0, None):
        p2 = G.two_phase_plan(f, pilot_y, n, margin)
        if p2["design"] == "pooled":
            assert margin is not None
            continue
        assert p2["two_phase"] and p2["phase2"] == [True, False]
        assert len(pilot) + sum(p2["to_label"]) <= n
        lab = dict(pilot_y)
        for cell, t in zip(p2["cells"], p2["to_label"]):
            for i in rng.sample([i for i in cell if i not in lab], t):
                lab[i] = h[i]
        est, lo, hi = AD.audit_interval(p2, f, lab)
        assert lo <= est <= hi and 0.0 <= lo and hi <= 1.0
    assert set(G.NEW) == {"jp40", "jp50", "jt40", "jt50", "jf40"} and G.GATE["jf40"][2] is None


def test_priced_two_phase_plan_is_capped_at_the_budget():
    """7be: a neg-only priced two-phase plan whose coder-positive pilot exceeds its allocation used to label more than
    n items; with budget_cap (the default) it labels at most n, and plan_audit_pre7ar keeps the old plan."""
    from llmci import audit_design as AD
    f = [0] * 3000 + [1] * 300
    h = [int(i % 25 == 0) for i in range(3000)] + [int(i % 2 == 0) for i in range(300)]
    pilot = list(range(0, 3000, 8)) + list(range(3000, 3300))  # 375 coder-negative, all 300 coder-positive items
    pilot_y = {i: h[i] for i in pilot}
    n = 960
    kw = dict(tau=0.10, neg_guard=3, width_margin=None, pseudo=2, two_phase="neg", price_floor=True, neg_floor=None)
    old = AD.plan_audit_pre7ar(f, pilot_y, n, **kw)
    new = AD.plan_audit(f, pilot_y, n, **kw)
    assert old["design"] == new["design"] == "cells"
    assert len(pilot) + sum(old["to_label"]) > n
    assert len(pilot) + sum(new["to_label"]) <= n


def test_rare_fallback_absolute_bar_7bf_summary_matches_the_log_and_paper():
    """7bf: the committed summary holds the numbers the log, README and paper quote."""
    here = Path(__file__).resolve().parent
    txt = (here / "experiments" / "h7bf_rare_fallback_abs.txt").read_text()
    assert "cells run: 92; errors (cell with < 2 labels): 0" in txt
    assert "P1 pooled_cv under 93% in 33 of 33 cells" in txt
    assert "P4a mean cost 0.0053 <= 0.01: yes; P4b largest 0.0230 <= 0.05: yes" in txt
    assert "Decision rule (d)" in txt
    w3 = next(l for l in txt.splitlines() if l.startswith("w3: "))
    assert "(('sadness p0.02', 200), 't10', 91.6)" in w3 and "(('gratitude p0.01', 1000), 't10', 92.6)" in w3
    assert "do-no-harm failures (P3) []" in w3
    paper = (here / "paper" / "paper.md").read_text()
    assert "0.0053" in paper and "91.6%" in paper and "93.2% or more" in paper


def test_small_count_band_7bg_summary_matches_the_log_and_paper():
    """7bg: the committed summary and by-count diagnostic hold the numbers the log, README and paper quote."""
    here = Path(__file__).resolve().parent
    txt = (here / "experiments" / "h7bg_small_count_band.txt").read_text()
    assert "cells run: 54; errors (cell with < 2 labels): 0" in txt
    assert "P1 w3 under 93% in 2 of 34 cells" in txt and "admiration p0.02 n 200 92.4" in txt
    assert "P2 w3c5 93%+ in every cell: no" in txt and "P4a mean cost 0.0303" in txt
    assert "Decision rule (d)" in txt
    m5 = next(l for l in txt.splitlines() if l.startswith("w3m5: "))
    assert "mean +0.0035, largest +0.0350" in m5
    byx = (here / "experiments" / "h7bg_small_count_band_byx.txt").read_text()
    assert "x 3: 11222 | 99.9 | 99.9 | 100.0" in byx and "x 10: 1691 | 42.5" in byx and "replay check" in byx
    paper = (here / "paper" / "paper.md").read_text()
    assert "7bg" in paper and "92.4%" in paper and "99.9% and 99.7%" in paper


def test_mid_p_interval_known_values():
    """7bg's mid-p exact interval: x = 0 of 200 has upper bound 1 - 0.05 ** (1 / 200); it sits inside Clopper-Pearson."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    import h7bg_small_count_band as G
    import h7av_rare_fallback as V
    lo, hi = G.mid_p(0, 200)
    assert lo == 0.0 and abs(hi - (1 - 0.05 ** (1 / 200))) < 1e-9
    for x in (1, 3, 4, 7):
        ml, mh = G.mid_p(x, 200)
        cl, ch = V.clopper_pearson(x, 200)
        assert cl < ml < x / 200 < mh < ch


def test_high_tail_hull_7bh_summary_matches_the_log_and_paper():
    """7bh: the committed summary and per-cell diagnostic hold the numbers the log, README and paper quote."""
    here = Path(__file__).resolve().parent
    txt = (here / "experiments" / "h7bh_high_tail_hull.txt").read_text()
    assert "cells run: 39; errors (cell with < 2 labels): 0" in txt
    assert "P1 w3 under 93% in 3 of 39 cells: yes" in txt and "q15 sadness p0.02 n 200 92.0" in txt
    assert "P2 hm10 93%+ in every cell: yes" in txt and "P4a mean cost 0.0446" in txt
    assert "Decision rule (b)" in txt
    hm = next(l for l in txt.splitlines() if l.startswith("hm10: "))
    assert "lowest coverage 95.7" in hm and "largest +0.0980" in hm
    byx = (here / "experiments" / "h7bh_high_tail_hull_byx.txt").read_text()
    assert "x 7: 3986 | 80.3 | 85.8" in byx and "replay check" in byx
    paper = (here / "paper" / "paper.md").read_text()
    assert "7bh" in paper and "0.045 of pooled" in paper and "94.4%" in paper


def test_hull_interval_only_widens():
    """7bh's hull: never narrower than the shipped interval for 3 <= x < top, untouched at x >= top, Wilson below 3."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    import h7bh_high_tail_hull as H
    import h7av_rare_fallback as V
    fb = H.FALLBACKS["hm10"]
    for x in range(3, 10):
        lo, hi = x / 200 - 0.001, x / 200 + 0.001
        l2, h2, fired = H.hull_interval(x, 200, lo, hi, fb)
        assert l2 <= lo and h2 >= hi and fired
        l3, h3, _ = H.hull_interval(x, 200, lo, hi, H.FALLBACKS["hml10"])
        assert l3 == l2 and h3 == hi
    assert H.hull_interval(12, 200, 0.05, 0.07, fb) == (0.05, 0.07, False)
    assert H.hull_interval(2, 200, 0.0, 1.0, fb)[:2] == V.wilson_labels(2, 200)


def test_lower_band_7bi_moves_only_the_lower_bound_inside_its_band():
    """7bi's band: for bottom <= x < top only the lower bound can drop; outside it the shipped interval is kept,
    Wilson below 3; the 90% band is never lower than the 95% one."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent / "experiments"))
    import h7bi_lower_band as B
    import h7av_rare_fallback as V
    l7, l7n, l5 = B.FALLBACKS["l7"], B.FALLBACKS["l7n"], B.FALLBACKS["l5"]
    for x in range(3, 12):
        lo, hi = x / 200 - 0.001, x / 200 + 0.004
        l2, h2, fired = B.hull_interval(x, 200, lo, hi, l7)
        assert h2 == hi and l2 <= lo
        assert fired == (7 <= x < 10)
        if not 7 <= x < 10:
            assert (l2, h2) == (lo, hi)
        ln, _, _ = B.hull_interval(x, 200, lo, hi, l7n)
        assert ln >= l2
        assert B.hull_interval(x, 200, lo, hi, l5)[2] == (5 <= x < 10)
    assert B.hull_interval(2, 200, 0.0, 1.0, l7)[:2] == V.wilson_labels(2, 200)
    assert B.hull_interval(5, 200, 0.02, 0.04, B.FALLBACKS["w3"]) == (0.02, 0.04, False)


def test_lower_band_7bi_summary_matches_the_log_and_paper():
    """7bi: the committed summary and diagnostic hold the numbers the log, README and paper quote."""
    here = Path(__file__).resolve().parent
    txt = (here / "experiments" / "h7bi_lower_band.txt").read_text()
    assert "cells run: 52 (39 near-trigger, 13 cost); errors (cell with < 2 labels): 0" in txt
    assert "P1 w3 under 93% in 0 of 39 near-trigger cells: no" in txt
    assert "P2 l7 93%+ in every cell: yes" in txt and "P4a mean cost 0.0074" in txt and "P4b largest 0.0330" in txt
    assert "Decision rule (c)" in txt
    l7 = next(l for l in txt.splitlines() if l.startswith("l7: "))
    assert "lowest coverage 93.9" in l7 and "near-trigger only +0.0044" in l7
    byx = (here / "experiments" / "h7bi_lower_band_byx.txt").read_text()
    assert "x 7: 7806 | 89.9 | 92.5" in byx and "replay check: pooled w3 and l7" in byx
    paper = (here / "paper" / "paper.md").read_text()
    assert "7bi" in paper and "0.0074 of pooled" in paper and "5 of 112" in paper
