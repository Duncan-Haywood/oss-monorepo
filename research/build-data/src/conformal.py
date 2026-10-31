"""Milestone 4 instrument: split-conformal intervals and a drift diagnostic (H2). Stdlib only.

Method: conformalised quantile regression (CQR; Romano, Patterson and Candes 2019, NeurIPS).
A model gives a lower and an upper quantile (tau 0.1 and 0.9). The score of a calibration row is
E = max(lo - y, y - hi); the interval widens by the finite-sample quantile of E:
  qhat = the ceil((n+1)(1-alpha))-th smallest score (infinite if that rank exceeds n),
  interval = [lo - qhat, hi + qhat], covering 1-alpha under exchangeability.
A negative qhat narrows the interval. Permit lags are integer days, so the lower end is clipped
at 0 and scores tie often; ties only make the guarantee conservative.

Drift diagnostic: exchangeability between the calibration year and the test year is what H2
bets on, so report (a) the two-sample Kolmogorov-Smirnov statistic of the scores of calibration
rows against the scores of test rows under the same uncalibrated interval, and (b) coverage by
test month, which shows where the calibration year stops describing the test year.
"""
import math


def conformal_quantile(scores, alpha):
    """Finite-sample split-conformal quantile: the ceil((n+1)(1-alpha))-th smallest score."""
    n = len(scores)
    k = math.ceil((n + 1) * (1 - alpha))
    if n == 0 or k > n:
        return math.inf
    return sorted(scores)[k - 1]


def cqr_scores(lo, hi, y):
    return [max(l - v, v - h) for l, h, v in zip(lo, hi, y)]


def cqr_interval(lo, hi, qhat, floor=0.0):
    return [max(floor, l - qhat) for l in lo], [h + qhat for h in hi]


def coverage(lo, hi, y):
    return sum(l <= v <= h for l, h, v in zip(lo, hi, y)) / len(y)


def ks_statistic(a, b):
    """Two-sample Kolmogorov-Smirnov statistic: max gap between the empirical CDFs."""
    a, b = sorted(a), sorted(b)
    i = j = 0
    d = 0.0
    while i < len(a) and j < len(b):
        x = min(a[i], b[j])
        while i < len(a) and a[i] <= x:
            i += 1
        while j < len(b) and b[j] <= x:
            j += 1
        d = max(d, abs(i / len(a) - j / len(b)))
    return d


def coverage_by_group(lo, hi, y, groups):
    out = {}
    for g in sorted(set(groups)):
        idx = [i for i, x in enumerate(groups) if x == g]
        out[g] = (len(idx), coverage([lo[i] for i in idx], [hi[i] for i in idx], [y[i] for i in idx]))
    return out


def evaluate(cal, test, alpha=0.2, months=None):
    """cal, test: dicts with lists lo, hi, y. Returns raw and conformalised coverage and the drift
    diagnostics. `months` is the test rows' month labels (optional)."""
    s_cal = cqr_scores(cal["lo"], cal["hi"], cal["y"])
    s_te = cqr_scores(test["lo"], test["hi"], test["y"])
    q = conformal_quantile(s_cal, alpha)
    lo2, hi2 = cqr_interval(test["lo"], test["hi"], q)
    r = dict(alpha=alpha, n_cal=len(s_cal), n_test=len(s_te), qhat=q,
             coverage_raw=coverage(test["lo"], test["hi"], test["y"]),
             coverage_conformal=coverage(lo2, hi2, test["y"]),
             mean_width_raw=sum(h - l for l, h in zip(test["lo"], test["hi"])) / len(s_te),
             mean_width_conformal=sum(h - l for l, h in zip(lo2, hi2)) / len(s_te),
             ks_scores_cal_vs_test=ks_statistic(s_cal, s_te))
    if months is not None:
        r["coverage_by_month"] = coverage_by_group(lo2, hi2, test["y"], months)
    return r
