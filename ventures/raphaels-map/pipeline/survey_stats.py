"""Weighted survey proportions with design-based uncertainty.

Pure numpy, no survey package, so the method is visible and testable.

Estimator. For a domain D (a filter such as "women 18-29, Catholic") and a
category c, the proportion among valid answers is the ratio

    p_c = sum_{i in D, valid} w_i * 1[y_i = c] / sum_{i in D, valid} w_i.

Variance (Taylor linearisation, with-replacement PSU approximation). The
linearised variable of the ratio is u_i = d_i w_i (1[y_i=c] - p_c) / N_D, with
d_i the domain-and-valid indicator and N_D the weighted domain base. It is
summed to PSU totals u_hj over **every** PSU in the design (PSUs with no
domain members contribute 0: domain estimation, not subsetting), and

    v(p_c) = sum_h n_h/(n_h - 1) * sum_j (u_hj - mean_h u)^2,

the standard first-stage, with-replacement estimator (Wolter 2007, ch. 6;
Lumley 2010, ch. 2). It ignores finite-population corrections and
later-stage variance, which is conservative when first-stage sampling
fractions are small, as they are in national household surveys. A stratum
with a single PSU has no within-stratum variance; it is centred on the grand
mean of PSU totals instead (the "adjust" rule of R's survey package), which
is conservative.

Intervals. The default is a logit-transformed interval,
logit(p) +/- t_{df} * se / (p (1 - p)), back-transformed, so bounds stay in
(0, 1) and small proportions get asymmetric intervals; df = #PSU - #strata.
When p is 0 or 1, or the design SE is 0, a Wilson interval at the Kish
effective sample size is used instead and the row says so.

Fallback. With no strata/PSU information the SE is the Kish-adjusted
binomial sqrt(p (1 - p) / n_eff) and the table carries the flag
``approx_ci``: such intervals are not design-correct and are not presented as
if they were.

Reliability guardrails (SPEC 6.2): n_eff < 30 -> rows are null and the table
is flagged ``suppressed_small_sample``; 30 <= n_eff < 100 -> flagged
``exploratory_sample``. Missing data never become zeros: an unobserved cell is
``None``.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from math import sqrt

import numpy as np
from scipy import stats

SUPPRESS_BELOW = 30.0
EXPLORATORY_BELOW = 100.0


def kish_n_eff(w) -> float:
    """Kish effective sample size (sum w)^2 / sum w^2. 0 for an empty set."""
    w = np.asarray(w, dtype=float)
    s2 = float(np.sum(w * w))
    return 0.0 if s2 == 0 else float(np.sum(w)) ** 2 / s2


def weighted_proportion(y, w) -> float | None:
    """Weighted mean of a 0/1 indicator; None when the weights sum to 0."""
    y = np.asarray(y, dtype=float)
    w = np.asarray(w, dtype=float)
    tot = float(np.sum(w))
    return None if tot == 0 else float(np.sum(w * y) / tot)


@dataclass
class Design:
    """Stratum and PSU labels for every case of the analysis file."""

    strata: np.ndarray
    psu: np.ndarray

    def __post_init__(self):
        self.strata = np.asarray(self.strata)
        self.psu = np.asarray(self.psu)
        # PSU ids are nested inside strata: make the pair the PSU key.
        keys = np.array([f"{s}\x1f{p}" for s, p in zip(self.strata, self.psu)])
        self._psu_idx = np.unique(keys, return_inverse=True)[1]
        self._str_idx = np.unique(self.strata.astype(str), return_inverse=True)[1]
        n_psu = self._psu_idx.max() + 1 if len(keys) else 0
        self._psu_stratum = np.zeros(n_psu, dtype=int)
        self._psu_stratum[self._psu_idx] = self._str_idx
        self.n_psu = int(n_psu)
        self.n_strata = int(self._str_idx.max() + 1) if len(keys) else 0

    @property
    def df(self) -> int:
        return max(self.n_psu - self.n_strata, 1)

    def total_variance(self, u) -> float:
        """With-replacement variance of the total of u (one value per case)."""
        u = np.asarray(u, dtype=float)
        tot = np.bincount(self._psu_idx, weights=u, minlength=self.n_psu)
        grand = tot.mean() if self.n_psu else 0.0
        v = 0.0
        for h in range(self.n_strata):
            t = tot[self._psu_stratum == h]
            nh = len(t)
            if nh >= 2:
                v += nh / (nh - 1) * float(np.sum((t - t.mean()) ** 2))
            elif nh == 1:
                v += float((t[0] - grand) ** 2)  # lonely PSU: "adjust"
        return v


def taylor_se_ratio(y, w, domain, design: Design) -> float:
    """Design-based SE of the domain ratio mean of y (Taylor linearisation)."""
    y = np.asarray(y, dtype=float)
    w = np.asarray(w, dtype=float)
    d = np.asarray(domain, dtype=bool)
    nd = float(np.sum(w[d]))
    if nd == 0:
        return float("nan")
    p = float(np.sum(w[d] * y[d]) / nd)
    u = np.where(d, w * (y - p) / nd, 0.0)
    return sqrt(design.total_variance(u))


def wilson(p: float, n: float, z: float) -> tuple[float, float]:
    if n <= 0:
        return (float("nan"), float("nan"))
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def logit_ci(p: float, se: float, crit: float) -> tuple[float, float]:
    lp = np.log(p / (1 - p))
    half = crit * se / (p * (1 - p))
    lo, hi = lp - half, lp + half
    return (float(1 / (1 + np.exp(-lo))), float(1 / (1 + np.exp(-hi))))


def _r(x, nd=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def estimate_table(codes, w, categories: "OrderedDict[str, set]", *, domain=None,
                   design: Design | None = None, missing_kind=None, level: float = 0.95,
                   suppress_below: float = SUPPRESS_BELOW,
                   exploratory_below: float = EXPLORATORY_BELOW) -> dict:
    """One cross-tab: the distribution of ``codes`` over ``categories`` in a domain.

    codes        numeric codes per case (NaN allowed).
    w            analysis weight per case (cases with w <= 0 or NaN are out of scope).
    categories   ordered {label: set of codes}; codes outside every set are not
                 valid answers and are excluded from the denominator.
    domain       boolean filter (the table's subgroup) over all cases.
    design       strata/PSU over **all** cases (domain estimation); None -> naive.
    missing_kind per-case string naming why a non-valid case is missing:
                 'dk', 'refused', 'iap' or anything else (counted as
                 'missing_unsplit'). Default: every non-valid case is unsplit.

    Returns the ARCHITECTURE.md crosstab body (without id/dataset/filters).
    """
    codes = np.asarray(codes, dtype=float)
    w = np.asarray(w, dtype=float)
    n_all = len(codes)
    dom = np.ones(n_all, bool) if domain is None else np.asarray(domain, bool)
    inscope = dom & np.isfinite(w) & (w > 0)
    valid = np.zeros(n_all, bool)
    for s in categories.values():
        valid |= np.isin(codes, list(s))
    d = inscope & valid
    n = int(d.sum())
    wd = w[d]
    n_eff = kish_n_eff(wd)
    base = float(wd.sum())

    miss = inscope & ~valid
    excluded = {"dk": 0, "refused": 0, "iap": 0, "missing_unsplit": 0}
    if missing_kind is None:
        excluded["missing_unsplit"] = int(miss.sum())
    else:
        mk = np.asarray(missing_kind, dtype=object)
        for k in ("dk", "refused", "iap"):
            excluded[k] = int(np.sum(miss & (mk == k)))
        excluded["missing_unsplit"] = int(miss.sum()) - sum(excluded[k] for k in ("dk", "refused", "iap"))

    flags: list[str] = []
    out = {"rows": None, "n": n, "n_eff": _r(n_eff), "weighted_base": _r(base, 3),
           "excluded": excluded, "flags": flags}
    if n == 0 or n_eff < suppress_below:
        flags.append("suppressed_small_sample")
        return out
    if n_eff < exploratory_below:
        flags.append("exploratory_sample")

    alpha = 1 - level
    if design is not None:
        crit = float(stats.t.ppf(1 - alpha / 2, design.df))
        out["design_df"] = design.df
    else:
        crit = float(stats.norm.ppf(1 - alpha / 2))
        flags.append("approx_ci")
    zcrit = float(stats.norm.ppf(1 - alpha / 2))

    rows = []
    wilson_used = False
    for label, s in categories.items():
        y = np.isin(codes, list(s)).astype(float)
        p = float(np.sum(wd * y[d]) / base)
        if design is not None:
            se = taylor_se_ratio(y, w, d, design)
        else:
            se = sqrt(p * (1 - p) / n_eff)
        if 0 < p < 1 and se > 0:
            lo, hi = logit_ci(p, se, crit)
        else:
            lo, hi = wilson(p, n_eff, zcrit)
            wilson_used = True
        deff = None
        if design is not None and 0 < p < 1:
            deff = (se * se) / (p * (1 - p) / n)
        rows.append({"category": label, "pct": _r(100 * p), "ci_low": _r(100 * lo),
                     "ci_high": _r(100 * hi), "se": _r(100 * se, 2),
                     "deff": _r(deff, 2)})
    if wilson_used:
        flags.append("ci_wilson_at_boundary")
    out["rows"] = rows
    return out
