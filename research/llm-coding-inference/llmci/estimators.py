"""Estimators of a corpus prevalence from LLM codes plus a hand-coded audit. Stdlib only.

Consolidates the one-corner versions in the `qual-*` projects (../../qual-correction,
../../qual-stratified) behind one interface. Every estimator takes binary codes and returns
`Est(value, se)`; the interval is value +/- z*se.

- `human_only`      mean of the audit (Bernoulli se).
- `naive`           mean of the coder's codes on the corpus; its se ignores coder error.
- `ppi`             prediction-powered inference, fixed weight lam (Angelopoulos et al. 2023;
                    lam=1 is the original, lam=0 is human-only).
- `ppi_pp`          PPI++ with the variance-minimising lam (Angelopoulos, Duchi & Zrnic 2023).
- `ipw_audit`       design-based estimator for an audit drawn with known inclusion
                    probabilities (Egami et al. 2023, DSL with known design).
- `ipw_audit_wilson`, `ipw_audit_bootstrap`  small-count-safe intervals for `ipw_audit`.
- `stratified_ppi`  PPI inside strata with corpus-known stratum sizes, so a stratified audit
                    needs no weights (Fisch et al. 2024). The target is the corpus's own mean
                    (a finite population), so the variance carries the finite-population
                    correction (1 - n_s/N_s).
- `label_shift`     confusion-matrix correction, binary case (Lipton, Wang & Smola 2018).

`ppi`, `ppi_pp` take the audit as (y, f) pairs and the coder's codes on the *unaudited* items
(`f_unl`), which is the setting of the PPI papers (the audit is then independent of f_unl).
"""
import math
from collections import namedtuple

Z95 = 1.959963984540054
Est = namedtuple("Est", "value se")


def _mean(xs):
    return sum(xs) / len(xs)


def _var(xs):
    n = len(xs)
    if n < 2:
        return 0.0
    m = _mean(xs)
    return sum((x - m) ** 2 for x in xs) / (n - 1)


def _cov(xs, ys):
    n = len(xs)
    mx, my = _mean(xs), _mean(ys)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (n - 1)


def interval(est, z=Z95):
    return est.value - z * est.se, est.value + z * est.se


def covers(est, truth, z=Z95):
    lo, hi = interval(est, z)
    return lo <= truth <= hi


def human_only(y):
    if len(y) < 2:
        raise ValueError("need at least two audited items")
    return Est(_mean(y), math.sqrt(_var(y) / len(y)))


def naive(f_all):
    return Est(_mean(f_all), math.sqrt(_var(f_all) / len(f_all)))


def ppi(y, f, f_unl, lam=1.0):
    """theta = mean(y) + lam * (mean(f_unl) - mean(f)); se from the two independent parts."""
    n, big_n = len(y), len(f_unl)
    if len(f) != n or n < 2 or big_n < 2:
        raise ValueError("need matching audit lists (n >= 2) and at least two unaudited items")
    value = _mean(y) + lam * (_mean(f_unl) - _mean(f))
    resid = [yi - lam * fi for yi, fi in zip(y, f)]
    se = math.sqrt(_var(resid) / n + lam * lam * _var(f_unl) / big_n)
    return Est(value, se)


def ppi_pp_lambda(y, f, f_unl):
    """Variance-minimising weight for the mean: cov(y, f) / ((1 + n/N) var(f)), clipped to [0, 1]
    (outside that range the interval is not guaranteed to beat both endpoints in small audits)."""
    n, big_n = len(y), len(f_unl)
    pooled_var = _var(list(f) + list(f_unl))
    if pooled_var == 0:
        return 0.0
    lam = _cov(y, f) / ((1 + n / big_n) * pooled_var)
    return min(1.0, max(0.0, lam))


def ppi_pp(y, f, f_unl):
    return ppi(y, f, f_unl, ppi_pp_lambda(y, f, f_unl))


def ipw_audit(f_all, audited, y_by_index, pi):
    """Design-based estimate of the corpus mean of the true code.

    f_all: coder's codes on all N items. audited: indices hand-coded. y_by_index: dict index -> true
    code. pi: dict or list, inclusion probability of every audited item (the audit design, known
    before coding; sampling is treated as independent Poisson draws). Estimate:
    mean(f_all) + (1/N) sum_audited (y - f) / pi. Variance (Poisson design, finite population):
    (1/N^2) sum_audited (1 - pi) / pi^2 * (y - f)^2.
    """
    big_n = len(f_all)
    tot, var = 0.0, 0.0
    for i in audited:
        p = pi[i]
        if not 0 < p <= 1:
            raise ValueError("inclusion probabilities must lie in (0, 1]")
        r = y_by_index[i] - f_all[i]
        tot += r / p
        var += (1 - p) / (p * p) * r * r
    return Est(_mean(f_all) + tot / big_n, math.sqrt(var) / big_n)


def ipw_audit_wilson(f_all, audited, y_by_index, pi, z=Z95):
    """Small-count-safe interval for `ipw_audit` (Wilson score on a Kish-type effective size).

    With the estimate p and the Poisson-design se, n_eff = p(1-p)/se^2 is the sample size of a
    simple random sample with the same variance; the interval is the Wilson interval for p at
    n_eff. It stays inside [0, 1] and does not collapse when p*n_eff is near 0. Returns (lo, hi).
    """
    e = ipw_audit(f_all, audited, y_by_index, pi)
    p = min(1.0, max(0.0, e.value))
    if e.se == 0 or p * (1 - p) == 0:
        return (p, p) if e.se == 0 else (0.0, min(1.0, z * e.se))
    n = p * (1 - p) / (e.se * e.se)
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, c - h), min(1.0, c + h)


def ipw_audit_bootstrap(f_all, audited, y_by_index, pi, rng, reps=300, level=0.95):
    """Percentile bootstrap interval for `ipw_audit`: resample the audited items with replacement
    (the coder's mean is fixed, since f_all is known on the whole corpus). Returns (lo, hi)."""
    big_n = len(f_all)
    base = _mean(f_all)
    terms = [(y_by_index[i] - f_all[i]) / pi[i] for i in audited]
    m = len(terms)
    draws = sorted(base + sum(terms[rng.randrange(m)] for _ in range(m)) / big_n for _ in range(reps))
    a = (1 - level) / 2
    return draws[int(a * reps)], draws[min(reps - 1, int((1 - a) * reps))]


def stratified_ppi(strata):
    """strata: list of (N_s, f_all_s, y_audit_s, f_audit_s) where f_all_s is the coder's codes on
    every item of the stratum and (y_audit_s, f_audit_s) are a simple random audit inside it, drawn
    without replacement. Each stratum is estimated as mean(f_all_s) + mean(y - f) over its audit;
    strata are combined with weights N_s / N. Variance: sum_s W_s^2 (1 - n_s/N_s) var_s(y - f) / n_s."""
    total = sum(s[0] for s in strata)
    value, var = 0.0, 0.0
    for big_ns, f_all, y, f in strata:
        n = len(y)
        if n < 2 or n > big_ns or len(f_all) != big_ns:
            raise ValueError("each stratum needs 2 <= n_s <= N_s audited items and all N_s coder codes")
        w = big_ns / total
        r = [a - b for a, b in zip(y, f)]
        value += w * (_mean(f_all) + _mean(r))
        var += w * w * (1 - n / big_ns) * _var(r) / n
    return Est(value, math.sqrt(var))


def stratified_human(strata):
    """Human-only estimate with corpus-known stratum sizes. strata: list of (N_s, y_audit_s), a simple
    random audit without replacement inside each stratum. Variance: sum_s W_s^2 (1 - n_s/N_s) var_s(y) / n_s."""
    total = sum(s[0] for s in strata)
    value, var = 0.0, 0.0
    for big_ns, y in strata:
        n = len(y)
        if n < 2 or n > big_ns:
            raise ValueError("each stratum needs 2 <= n_s <= N_s audited items")
        w = big_ns / total
        value += w * _mean(y)
        var += w * w * (1 - n / big_ns) * _var(y) / n
    return Est(value, math.sqrt(var))


def label_shift(f_all, y, f):
    """Binary confusion-matrix correction: p = (q - fpr) / (tpr - fpr), q the coder-positive rate on
    the corpus, tpr and fpr measured on the audit (random, or stratified by the *true* code). Delta-method
    se from the three independent binomial pieces."""
    pos = [fi for yi, fi in zip(y, f) if yi == 1]
    neg = [fi for yi, fi in zip(y, f) if yi == 0]
    if len(pos) < 2 or len(neg) < 2:
        raise ValueError("audit needs at least two true positives and two true negatives")
    tpr, fpr, q = _mean(pos), _mean(neg), _mean(f_all)
    d = tpr - fpr
    if d <= 0:
        raise ValueError("coder is not better than chance on the audit")
    p = (q - fpr) / d
    v_q = q * (1 - q) / len(f_all)
    v_t = tpr * (1 - tpr) / len(pos)
    v_f = fpr * (1 - fpr) / len(neg)
    # dp/dq = 1/d ; dp/dfpr = (q - tpr)/d^2 ; dp/dtpr = -(q - fpr)/d^2
    se = math.sqrt(v_q / d**2 + v_f * ((q - tpr) / d**2) ** 2 + v_t * ((q - fpr) / d**2) ** 2)
    return Est(p, se)


def neyman_total(sizes, s2, half, z=Z95):
    """Smallest real-valued total audit size n so that the stratified-PPI half-width is `half` under Neyman
    allocation n_h proportional to N_h S_h, with the finite-population correction. sizes: stratum sizes N_h;
    s2: variances S_h^2 of r = y - f in each stratum. Solves z^2 [ (sum W S)^2 / n - sum W_h^2 S_h^2 / N_h ] = half^2,
    so n = (sum W S)^2 / (half^2 / z^2 + sum W_h^2 S_h^2 / N_h)."""
    big = sum(sizes)
    w = [N / big for N in sizes]
    s = [math.sqrt(v) for v in s2]
    num = sum(a * b for a, b in zip(w, s)) ** 2
    return num / (half ** 2 / z ** 2 + sum(a * a * v / N for a, v, N in zip(w, s2, sizes)))


def stratified_ppi_tuned(strata, lam=None):
    """stratified_ppi with a control-variate weight per stratum. Same input. Each stratum is estimated as
    lam_s * mean(f_all_s) + mean(y - lam_s * f) over its audit; strata combine with weights N_s / N. With lam=None,
    lam_s = cov_audit(y, f) / var_all(f) (f's variance is known on the whole stratum, so no 1 + n/N term),
    clipped to [0, 1]; a stratum whose coder is constant gets 0. Pass lam (a number, or one per stratum) to fix it.
    Variance: sum_s W_s^2 (1 - n_s/N_s) var_s(y - lam_s f) / n_s, plugging in the lam used."""
    total = sum(s[0] for s in strata)
    value, var = 0.0, 0.0
    for i, (big_ns, f_all, y, f) in enumerate(strata):
        n = len(y)
        if n < 2 or n > big_ns or len(f_all) != big_ns:
            raise ValueError("each stratum needs 2 <= n_s <= N_s audited items and all N_s coder codes")
        if lam is None:
            vf = _var(f_all)
            ls = 0.0 if vf == 0 else min(1.0, max(0.0, _cov(y, f) / vf))
        else:
            ls = lam[i] if isinstance(lam, (list, tuple)) else lam
        r = [a - ls * b for a, b in zip(y, f)]
        w = big_ns / total
        value += w * (ls * _mean(f_all) + _mean(r))
        var += w * w * (1 - n / big_ns) * _var(r) / n
    return Est(value, math.sqrt(var))


def stratum_lambda_s2(y_all, f_all):
    """Oracle control-variate weight and residual variance for one stratum, from y and f on every item:
    lam = cov(y, f) / var(f) clipped to [0, 1], S2 = var(y - lam f) (sample variance). Feed the S2 values to
    neyman_total to size an audit for stratified_ppi_tuned (lam=0 gives the human-only plan, lam=1 the plain PPI plan)."""
    vf = _var(f_all)
    lam = 0.0 if vf == 0 else min(1.0, max(0.0, _cov(y_all, f_all) / vf))
    return lam, _var([a - lam * b for a, b in zip(y_all, f_all)])
