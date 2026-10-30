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
    assert S.screen(rare, rare) == "pooled"  # perfect coder but 10 < 20 positives
    assert S.screen(rare, rare, guard=10) == "cells"


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
