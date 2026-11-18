"""Reference values for contingency-table-tests, from scipy and statsmodels.

Run: python3 eval/reference.py > eval/reference.json  (scipy 1.18.1, statsmodels 0.15.0, numpy).
Used only to produce the reference file; nothing here is ported into engine.mjs.

Barnard's region here counts ties within 1e-12 (relative) as ties; scipy's own value is kept
beside it as "scipy" so the cases where scipy drops a mirror-image table can be counted.

Conventions: the engine's rows are groups and its first column is the event. scipy's
barnard_exact and boschloo_exact take the groups as columns, so they get the transpose.
For Barnard and Boschloo the reference "sup" is the maximum of the same objective on a dense
10,001-point grid, because the p-value is a supremum and a local optimiser can stop below it.
"""
import itertools
import json
import math
import sys

import numpy as np
import scipy
import statsmodels
from scipy import stats
from scipy.stats.contingency import odds_ratio
from statsmodels.stats.contingency_tables import StratifiedTable, Table2x2, mcnemar
from statsmodels.stats.proportion import confint_proportions_2indep

rng = np.random.default_rng(20261117)
TIES = []  # per Barnard call: tables inside the tolerant region that a plain >= leaves out
EXACT_TIE = []  # for each such table: is its statistic equal to the observed one in exact rational arithmetic?


def exact_tie(i, j, a, b, c1, c2, pooled, alternative):
    from fractions import Fraction as F

    def t2(x1, x2):
        p1, p2 = F(x1, c1), F(x2, c2)
        if p1 == p2:
            return F(0), 0
        if pooled:
            p = F(x1 + x2, c1 + c2)
            v = p * (1 - p) * (F(1, c1) + F(1, c2))
        else:
            v = p1 * (1 - p1) / c1 + p2 * (1 - p2) / c2
        return (p1 - p2) ** 2 / v if v else None, (1 if p1 > p2 else -1)
    (s0, g0), (s1, g1) = t2(a, b), t2(i, j)
    if s0 is None or s1 is None:
        print("non-finite", (a, b), (i, j), c1, c2, pooled, alternative, file=sys.stderr)
        return False
    if s0 != s1:
        print("not exact", (a, b), (i, j), c1, c2, pooled, alternative, float(s0), float(s1), g0, g1, file=sys.stderr)
    return s0 == s1 and (alternative == "two-sided" or g0 == g1)


def grid_sup(table, kind, alternative, pooled=True, strict_ties=False):
    """Dense-grid supremum of scipy's own nuisance objective (same region scipy builds)."""
    from scipy.stats import _hypotests as h
    t = np.asarray(table, dtype=np.int64)
    c1, c2 = t.sum(axis=0)
    x1 = np.arange(c1 + 1).reshape(-1, 1)
    x2 = np.arange(c2 + 1).reshape(1, -1)
    if kind == "barnard":
        p1, p2 = x1 / c1, x2 / c2
        if pooled:
            p = (x1 + x2) / (c1 + c2)
            v = p * (1 - p) * (1 / c1 + 1 / c2)
        else:
            v = p1 * (1 - p1) / c1 + p2 * (1 - p2) / c2
        with np.errstate(divide="ignore", invalid="ignore"):
            w = (p1 - p2) / np.sqrt(v)
        w[p1 == p2] = 0
        w0 = w[t[0, 0], t[0, 1]]
        # Ties within 1e-12 relative count as ties: mirror-image tables have equal |T| in exact
        # arithmetic but can differ in the last bit, and scipy's plain >= then drops one of them.
        tol = 1e-12 * max(1.0, abs(w0)) if np.isfinite(w0) else 0.0
        idx = {"two-sided": np.abs(w) >= abs(w0) - tol, "less": w <= w0 + tol, "greater": w >= w0 - tol}[alternative]
        strict = {"two-sided": np.abs(w) >= abs(w0), "less": w <= w0, "greater": w >= w0}[alternative]
        if not np.isfinite(w0):
            strict = idx  # an infinite statistic has no rounding to tolerate
        if strict_ties:
            idx = strict
        else:
            dropped = np.argwhere(idx != strict)
            TIES.append(int(len(dropped)))
            for i, j in dropped:
                EXACT_TIE.append(exact_tie(int(i), int(j), int(t[0, 0]), int(t[0, 1]), int(c1), int(c2), pooled, alternative))
    else:
        total = c1 + c2
        xa = np.arange(c1 + 1).reshape(1, -1)
        xb = np.arange(c2 + 1).reshape(-1, 1)
        if alternative == "less":
            pv = stats.hypergeom.cdf(xa, total, xa + xb, c1).T
        else:
            pv = stats.hypergeom.cdf(xb, total, xa + xb, c2).T
        f0 = pv[t[0, 0], t[0, 1]]
        idx = pv <= f0 * (1 + 1e-13)
    s = (x1 + x2)[idx]
    lc = (h._compute_log_combinations(c1)[x1] + h._compute_log_combinations(c2)[x2])[idx]
    if s.size == 0:
        return 0.0
    N = c1 + c2
    # Bucket by total successes s: the objective is sum_s w_s pi^s (1 - pi)^(N - s).
    logw = np.full(N + 1, -np.inf)
    for sv in np.unique(s):
        v = lc[s == sv]
        mv = v.max()
        logw[sv] = mv + np.log(np.exp(v - mv).sum())
    keep = np.isfinite(logw)
    sv = np.arange(N + 1)[keep]
    lw = logw[keep]
    best = -np.inf
    for chunk in np.array_split(np.linspace(1e-12, 1 - 1e-12, 10001), 20):
        pi = chunk.reshape(-1, 1)
        terms = lw.reshape(1, -1) + sv.reshape(1, -1) * np.log(pi) + (N - sv.reshape(1, -1)) * np.log1p(-pi)
        m = terms.max(axis=1, keepdims=True)
        best = max(best, float((m + np.log(np.exp(terms - m).sum(axis=1, keepdims=True))).max()))
    return min(1.0, math.exp(best))


def unconditional(table, kind, alternative, pooled=True):
    tt = np.array(table).T
    if kind == "barnard":
        r = stats.barnard_exact(tt, alternative=alternative, pooled=pooled)
    else:
        r = stats.boschloo_exact(tt, alternative=alternative)
    if alternative == "two-sided" and kind == "boschloo":
        g = 2 * min(grid_sup(tt, kind, "less"), grid_sup(tt, kind, "greater"))
    else:
        g = grid_sup(tt, kind, alternative, pooled)
    out = {"scipy": float(r.pvalue), "sup": min(1.0, g)}
    if kind == "barnard":
        # The same grid over scipy's own (strict >=) region: scipy below this is its optimiser stopping short.
        out["strict"] = min(1.0, grid_sup(tt, kind, alternative, pooled, strict_ties=True))
    return out


def two_by_two(t):
    a, b = t[0]
    c, d = t[1]
    out = {"table": t}
    for alt in ["two-sided", "less", "greater"]:
        out[f"fisher_{alt}"] = float(stats.fisher_exact(t, alternative=alt).pvalue)
        orr = odds_ratio(t, kind="conditional")
        ci = orr.confidence_interval(confidence_level=0.95, alternative=alt)
        out[f"cond_or_ci_{alt}"] = [float(ci.low), float(ci.high)]
    out["cond_or"] = float(odds_ratio(t, kind="conditional").statistic)
    if 0 not in (a + b, c + d) and (a + b) * (c + d) <= 250000:
        for alt in ["two-sided", "less", "greater"]:
            out[f"barnard_pooled_{alt}"] = unconditional(t, "barnard", alt, True)
            out[f"boschloo_{alt}"] = unconditional(t, "boschloo", alt)
        out["barnard_unpooled_two-sided"] = unconditional(t, "barnard", "two-sided", False)
    arr = np.array(t)
    if (arr.sum(axis=0) > 0).all() and (arr.sum(axis=1) > 0).all():
        x2 = stats.chi2_contingency(arr, correction=False)
        y = stats.chi2_contingency(arr, correction=True)
        g = stats.chi2_contingency(arr, correction=False, lambda_="log-likelihood")
        out["chi2"] = [float(x2.statistic), float(x2.pvalue)]
        out["yates"] = [float(y.statistic), float(y.pvalue)]
        out["g"] = [float(g.statistic), float(g.pvalue)]
    if min(a, b, c, d) > 0:
        tb = Table2x2(arr)
        out["woolf_or_ci"] = [float(v) for v in tb.oddsratio_confint(alpha=0.05)]
        out["katz_rr_ci"] = [float(v) for v in tb.riskratio_confint(alpha=0.05)]
    if a + b > 0 and c + d > 0:
        out["newcombe"] = [float(v) for v in confint_proportions_2indep(a, a + b, c, c + d, method="newcomb", compare="diff", alpha=0.05)]
    return out


def brute_rxc(t):
    """Fisher-Freeman-Halton by plain enumeration of every table with the margins (a different algorithm)."""
    t = np.array(t)
    r, c = t.sum(axis=1), t.sum(axis=0)
    n = t.sum()
    lf = [math.lgamma(k + 1) for k in range(n + 1)]
    const = sum(lf[v] for v in r) + sum(lf[v] for v in c) - lf[n]
    obs = const - sum(lf[v] for v in t.flat)
    total = 0.0
    R, C = len(r), len(c)

    def rec(i, colleft, acc):
        nonlocal total
        if i == R - 1:
            lp = acc - sum(lf[v] for v in colleft)
            if const + lp <= obs + 1e-7:
                total += math.exp(const + lp)
            return
        for row in itertools.product(*[range(v + 1) for v in colleft]):
            if sum(row) != r[i]:
                continue
            rec(i + 1, [cl - x for cl, x in zip(colleft, row)], acc - sum(lf[v] for v in row))

    rec(0, list(c), 0.0)
    return min(1.0, total)


def clean(v):
    """JSON has no Infinity or NaN: write them as the strings "Infinity", "-Infinity" and null."""
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return v
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    return v


def main():
    cases = []
    fixed = [[[3, 1], [1, 3]], [[2, 15], [10, 3]], [[7, 8], [12, 3]], [[0, 10], [5, 5]], [[1, 0], [0, 1]],
             [[10, 0], [0, 10]], [[74, 43], [31, 32]], [[512, 313], [89, 19]], [[1198, 1493], [557, 1278]]]
    for t in fixed:
        cases.append(two_by_two(t))
    for _ in range(60):
        n1, n2 = int(rng.integers(3, 40)), int(rng.integers(3, 40))
        p1, p2 = rng.uniform(0.05, 0.95, 2)
        a, c = int(rng.binomial(n1, p1)), int(rng.binomial(n2, p2))
        cases.append(two_by_two([[a, n1 - a], [c, n2 - c]]))

    rxc = []
    for t in [[[3, 1, 2], [1, 3, 2]], [[2, 0, 1], [0, 3, 1], [1, 1, 2]], [[4, 1, 0, 2], [1, 3, 2, 0]],
              [[1, 2, 0], [0, 1, 3], [2, 0, 1], [1, 1, 1]]]:
        arr = np.array(t)
        x2 = stats.chi2_contingency(arr, correction=False)
        g = stats.chi2_contingency(arr, correction=False, lambda_="log-likelihood")
        rxc.append({"table": t, "exact": brute_rxc(t), "chi2": [float(x2.statistic), float(x2.pvalue), int(x2.dof)],
                    "g": [float(g.statistic), float(g.pvalue)]})
    for _ in range(12):
        R, C = int(rng.integers(2, 4)), int(rng.integers(3, 5))
        t = rng.integers(0, 4, size=(R, C)).tolist()
        arr = np.array(t)
        if (arr.sum(axis=0) == 0).any() or (arr.sum(axis=1) == 0).any():
            continue
        x2 = stats.chi2_contingency(arr, correction=False)
        rxc.append({"table": t, "exact": brute_rxc(t), "chi2": [float(x2.statistic), float(x2.pvalue), int(x2.dof)]})

    strat = []
    ucb = {"A": [[512, 313], [89, 19]], "B": [[353, 207], [17, 8]], "C": [[120, 205], [202, 391]],
           "D": [[138, 279], [131, 244]], "E": [[53, 138], [94, 299]], "F": [[22, 351], [24, 317]]}
    rabbits = [[[0, 6], [0, 5]], [[3, 3], [0, 6]], [[6, 0], [2, 4]], [[5, 1], [6, 0]], [[2, 0], [5, 0]]]
    sets = [("ucb", list(ucb.values())), ("rabbits", rabbits)]
    for k in range(6):
        K = int(rng.integers(2, 6))
        tabs = []
        for _ in range(K):
            n1, n2 = int(rng.integers(5, 40)), int(rng.integers(5, 40))
            pp = rng.uniform(0.1, 0.9)
            a, c = int(rng.binomial(n1, min(0.95, pp * 1.3))), int(rng.binomial(n2, pp))
            tabs.append([[a, n1 - a], [c, n2 - c]])
        sets.append((f"random{k}", tabs))
    for name, tabs in sets:
        arr = np.array(tabs, dtype=float).transpose(1, 2, 0)
        st = StratifiedTable(arr)
        nc = st.test_null_odds(correction=True)
        nu = st.test_null_odds(correction=False)
        entry = {"name": name, "strata": tabs, "cmh_corrected": [float(nc.statistic), float(nc.pvalue)],
                 "cmh": [float(nu.statistic), float(nu.pvalue)], "mh_or": float(st.oddsratio_pooled),
                 "mh_or_ci": [float(v) for v in st.oddsratio_pooled_confint(alpha=0.05)]}
        if all(min(min(r) for r in t) > 0 for t in tabs) or name == "ucb":
            bd = st.test_equal_odds(adjust=False)
            ta = st.test_equal_odds(adjust=True)
            entry["breslow_day"] = [float(bd.statistic), float(bd.pvalue)]
            entry["tarone"] = [float(ta.statistic), float(ta.pvalue)]
        strat.append(entry)

    paired = []
    for t in [[[59, 6], [16, 80]], [[10, 2], [8, 30]], [[5, 0], [0, 5]], [[20, 12], [3, 9]], [[1, 25], [10, 2]]]:
        ex = mcnemar(np.array(t), exact=True)
        cc = mcnemar(np.array(t), exact=False, correction=True)
        nc = mcnemar(np.array(t), exact=False, correction=False)
        paired.append({"table": t, "exact": float(ex.pvalue), "corrected": [float(cc.statistic), float(cc.pvalue)],
                       "chi2": [float(nc.statistic), float(nc.pvalue)]})

    json.dump(clean({"generator": "eval/reference.py", "versions": {"python": sys.version.split()[0], "numpy": np.__version__,
               "scipy": scipy.__version__, "statsmodels": statsmodels.__version__},
               "scipy_tie_drops": sum(1 for t in TIES if t), "tie_tables": len(EXACT_TIE), "tie_tables_exact": sum(EXACT_TIE), "two_by_two": cases, "rxc": rxc, "stratified": strat, "paired": paired}), sys.stdout, indent=1, allow_nan=False)


if __name__ == "__main__":
    main()
