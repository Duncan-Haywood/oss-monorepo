"""Prevalence estimators for a binary code applied by an LLM to a corpus. Stdlib only.

Setting: N corpus items, an LLM code f_i in {0,1} on every item, a human code h_i
on an audited subset. The target is the corpus share of h = 1 (a gap between two
groups is the difference of two such shares). Every estimator returns an `Est`
(estimate, standard error); an interval is estimate +/- z * se.

Consolidates the estimators of the 22 `qual-*` projects behind one interface:
naive, human_only, ppi (Angelopoulos et al. 2023), ppi_pp (power-tuned, 2023b),
stratified (design-based audit sampled by strata with known probabilities, after
Fisch et al. 2024 and Egami et al. 2023), group_weighted (corpus-known group
mix), and confusion_correction (label-shift style, Lipton et al. 2018), plus the
closed-form audit size `audit_size_ppi` that hypothesis H5 tests.
"""
import math
from collections import namedtuple

Z95 = 1.959963984540054
Est = namedtuple("Est", "est se")


def _mean(xs):
    return sum(xs) / len(xs)


def _var(xs):
    """Sample variance (n - 1); 0 below two values."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = _mean(xs)
    return sum((x - m) ** 2 for x in xs) / (n - 1)


def interval(e, z=Z95):
    return e.est - z * e.se, e.est + z * e.se


def covers(e, truth, z=Z95):
    lo, hi = interval(e, z)
    return lo <= truth <= hi


def naive(f_all):
    """Trust the LLM: share coded 1. The standard error ignores coder error."""
    return Est(_mean(f_all), math.sqrt(_var(f_all) / len(f_all)))


def human_only(h_gold):
    """Share coded 1 by humans on a simple random audit."""
    return Est(_mean(h_gold), math.sqrt(_var(h_gold) / len(h_gold)))


def ppi(f_all, f_gold, h_gold):
    """Prediction-powered mean with weight 1: mean(f) + mean(h - f on the audit).
    The audit must be a simple random sample of the corpus."""
    return ppi_pp(f_all, f_gold, h_gold, lam=1.0)


def ppi_pp(f_all, f_gold, h_gold, lam=None):
    """PPI++ (Angelopoulos et al. 2023b): theta = lam*mean(f_all) + mean(h - lam*f).
    lam=1 is `ppi`, lam=0 is `human_only`; lam=None picks the variance-minimising
    value from the data, clipped to [0, 1]."""
    n, N = len(h_gold), len(f_all)
    if len(f_gold) != n or n < 2:
        raise ValueError("need at least two audited items with LLM codes")
    if lam is None:
        mh, mf = _mean(h_gold), _mean(f_gold)
        cov = sum((h - mh) * (f - mf) for h, f in zip(h_gold, f_gold)) / (n - 1)
        vf = _var(f_gold)
        # Optimal lam = cov(h,f) / ((1 + n/N) var(f)) for the unclipped estimator.
        lam = 0.0 if vf == 0 else min(1.0, max(0.0, cov / ((1 + n / N) * vf)))
    resid = [h - lam * f for h, f in zip(h_gold, f_gold)]
    est = lam * _mean(f_all) + _mean(resid)
    se = math.sqrt(lam * lam * _var(f_all) / N + _var(resid) / n)
    return Est(est, se)


def stratified(f_all, strata_all, audit, finite_population=True):
    """Design-based estimate when the audit was drawn by simple random sampling
    *within strata* (for example by the LLM's own code), with the stratum sizes
    known from the corpus.

    `strata_all` gives each corpus item's stratum; `audit` maps stratum -> list of
    (f_i, h_i) pairs for the audited items of that stratum. Estimate:
    mean(f) + sum_s (N_s / N) * mean_s(h - f). If `finite_population` the target
    is the realised corpus share and the variance is the stratified
    finite-population one, sum_s (N_s/N)^2 (1 - n_s/N_s) S_s^2 / n_s. Otherwise
    the corpus is treated as a draw from a super-population and var(f)/N is added.
    A stratum with no audited item raises: the estimate would be undefined."""
    N = len(f_all)
    sizes = {}
    for s in strata_all:
        sizes[s] = sizes.get(s, 0) + 1
    est = _mean(f_all)
    var = 0.0
    for s, Ns in sizes.items():
        pairs = audit.get(s, [])
        ns = len(pairs)
        if ns < 2:
            raise ValueError(f"stratum {s!r} needs at least two audited items, has {ns}")
        d = [h - f for f, h in pairs]
        w = Ns / N
        est += w * _mean(d)
        var += w * w * (1 - ns / Ns) * _var(d) / ns
    if not finite_population:
        var += _var(f_all) / N
    return Est(est, math.sqrt(var))


def group_weighted(group_sizes, per_group):
    """Corpus share from per-group estimates and corpus-known group sizes.
    `per_group` maps group -> Est; groups are independent audits, so
    se^2 = sum (N_g/N)^2 se_g^2. This is the pooled-correction fix tested by H1."""
    N = sum(group_sizes[g] for g in per_group)
    est = sum(group_sizes[g] / N * e.est for g, e in per_group.items())
    se = math.sqrt(sum((group_sizes[g] / N) ** 2 * e.se ** 2 for g, e in per_group.items()))
    return Est(est, se)


def confusion_correction(f_all, f_gold, h_gold):
    """Count correction by the coder's confusion matrix (the binary case of
    Lipton et al. 2018): q = P(f=1) = sens*p + (1-spec)*(1-p), so
    p = (q - (1-spec)) / (sens + spec - 1), clipped to [0, 1]. Sensitivity and
    specificity come from the audit; the delta-method standard error uses the
    audit's sampling error in both and the corpus error in q. Fails when the
    coder is no better than chance (sens + spec <= 1)."""
    pos = [f for f, h in zip(f_gold, h_gold) if h == 1]
    neg = [f for f, h in zip(f_gold, h_gold) if h == 0]
    if len(pos) < 2 or len(neg) < 2:
        raise ValueError("audit needs at least two items of each human code")
    sens, spec = _mean(pos), 1 - _mean(neg)
    j = sens + spec - 1
    if j <= 0:
        raise ValueError("coder is no better than chance on the audit")
    q = _mean(f_all)
    p = (q - (1 - spec)) / j
    v_q = _var(f_all) / len(f_all)
    v_sens = _var(pos) / len(pos)
    v_spec = _var(neg) / len(neg)
    var = (v_q + (p ** 2) * v_sens + ((1 - p) ** 2) * v_spec) / j ** 2
    return Est(min(1.0, max(0.0, p)), math.sqrt(var))


def gap(a, b):
    """Difference a - b of two independently audited estimates."""
    return Est(a.est - b.est, math.hypot(a.se, b.se))


def audit_size_ppi(p_h, sens, spec, n_corpus=None):
    """Closed-form audit size at which `ppi` (lam = 1, simple random audit) has the
    same standard error as human-only at the same audit size: the break-even.

    With h ~ Bernoulli(p), coder sensitivity `sens`, specificity `spec`,
    var(h) = p(1-p). PPI's rectifier d = h - f takes +1 w.p. a = p(1-sens), -1
    w.p. b = (1-p)(1-spec), else 0, so var(d) = a + b - (a - b)^2. The PPI
    variance is var(f)/N + var(d)/n and the human-only one var(h)/n, so PPI is
    no wider iff n <= (var(h) - var(d)) * N / var(f). Returns (var(d)/var(h),
    that largest n); n is 0 when var(d) >= var(h) (the coder is too weak to
    help) and None when `n_corpus` is not given."""
    a, b = p_h * (1 - sens), (1 - p_h) * (1 - spec)
    var_d = a + b - (a - b) ** 2
    var_h = p_h * (1 - p_h)
    q = p_h * sens + (1 - p_h) * (1 - spec)
    var_f = q * (1 - q)
    ratio = var_d / var_h if var_h else math.inf
    if n_corpus is None:
        return ratio, None
    if var_d >= var_h:
        return ratio, 0
    if var_f == 0:
        return ratio, math.inf
    return ratio, (var_h - var_d) * n_corpus / var_f
