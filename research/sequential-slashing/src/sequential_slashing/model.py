"""Anytime-valid slashing of a verifier that reports fault probability p.

H0: the verifier is calibrated, y_t ~ Bernoulli(p_t) given the past.  A slashing
rule must not punish honest verifiers more than alpha of the time *however
often it looks*.

For a constant reported p, the LR, mixture and peeking-z statistics depend on
the outcomes only through (t, s), the step and the number of faults so far, so
`stopped(method, t, s, ...)` is the single decision rule: the simulators
(`run_*`) and the exact dynamic program (`exact_stop_dist`) both call it, and
the exact false-slash probabilities are computed from the shipped rule, not a
copy of it.  For reports p_t that vary by round, `run_mixture_varying` is the
e-process (one- or two-sided); it reduces to `run_mixture` when p_t is constant.
"""
import math, random
from statistics import NormalDist

__all__ = ["kl", "lr_step", "bet_step", "run_lr", "run_mixture", "run_ztest_peeking",
           "wald_lower", "mixture_grid", "false_slash_rate", "detection_times",
           "frac_grid", "mixture_tv_path", "run_mixture_tv", "METHODS"]

METHODS = ("lr", "mixture", "z")


def _check_rate(x, name):
    """A Bernoulli rate the formulas can divide by: strictly inside (0, 1)."""
    if x is None or not 0 < x < 1:
        raise ValueError(f"{name} must be strictly between 0 and 1, got {x!r}")


def _check_alpha(alpha):
    if not 0 < alpha < 1:
        raise ValueError(f"alpha must be strictly between 0 and 1, got {alpha!r}")


def kl(q, p):
    """Bernoulli KL(q||p) in nats."""
    _check_rate(p, "p")
    s = 0.0
    if q > 0: s += q * math.log(q / p)
    if q < 1: s += (1 - q) * math.log((1 - q) / (1 - p))
    return s


def lr_step(y, p, q):
    """Likelihood-ratio factor of alternative q against null p."""
    return q / p if y else (1 - q) / (1 - p)


def bet_step(y, p, lam):
    """Betting factor 1 + lam*(y-p); a nonnegative mean-one martingale under H0
    for lam in (-1/(1-p), 1/p)."""
    return 1 + lam * (y - p)


def wald_lower(alpha, q, p):
    """Wald's lower bound on E[tau] for any level-alpha sequential test: ln(1/alpha)/KL(q||p)."""
    _check_alpha(alpha)
    if q == p:
        raise ValueError("Wald's bound is infinite at q == p")
    return math.log(1 / alpha) / kl(q, p)


def _fracs(K, spacing):
    """K bet fractions in (0, 1). 'uniform' is the original grid (k+0.5)/K;
    'log' spaces them geometrically from 1e-3 to 1, so small edges (a fault rate
    of 1% misreported by half wants a fraction near 0.005) have a bet that grows."""
    if spacing == "uniform":
        return [(k + 0.5) / K for k in range(K)]
    if spacing == "log":
        return [1e-3 ** (1 - (k + 0.5) / K) for k in range(K)]
    raise ValueError(f"spacing must be 'uniform' or 'log', got {spacing!r}")


def mixture_grid(p, K=64, spacing="uniform"):
    """Grid of positive bets lambda in (0, 1/p) (one-sided: verifier faults more than claimed)."""
    _check_rate(p, "p")
    return [f / p for f in _fracs(K, spacing)]


def run_lr(ys, p, q, alpha):
    """Return first t with LR e-process >= 1/alpha, else None.

    q must exceed p: this is the one-sided test against under-reported faults
    (with q < p the process grows on *fewer* faults than claimed)."""
    _check_rate(p, "p"); _check_rate(q, "q"); _check_alpha(alpha)
    if not q > p:
        raise ValueError(f"run_lr tests q > p; got q={q} <= p={p}")
    lg, thr = 0.0, math.log(1 / alpha)
    for t, y in enumerate(ys, 1):
        lg += math.log(lr_step(y, p, q))
        if lg >= thr: return t
    return None


def run_mixture(ys, p, alpha, K=64, spacing="uniform"):
    """Equal-weight mixture over K bet sizes: needs no knowledge of q."""
    _check_alpha(alpha)
    lams = mixture_grid(p, K, spacing)
    lw = [0.0] * K
    thr = math.log(1 / alpha)
    for t, y in enumerate(ys, 1):
        for i, l in enumerate(lams): lw[i] += math.log(bet_step(y, p, l))
        m = max(lw)
        if m + math.log(sum(math.exp(w - m) for w in lw) / K) >= thr: return t
    return None


def run_ztest_peeking(ys, p, alpha, t0=30):
    """Fixed-sample one-sided z-test, naively re-run at every step from t0. Returns first rejection."""
    from statistics import NormalDist
    _check_rate(p, "p"); _check_alpha(alpha)
    z = NormalDist().inv_cdf(1 - alpha)
    s, sd = 0, math.sqrt(p * (1 - p))
    for t, y in enumerate(ys, 1):
        s += y
        if t >= t0 and (s - t * p) / (sd * math.sqrt(t)) >= z: return t
    return None


def _draw(rng, n, q):
    return [1 if rng.random() < q else 0 for _ in range(n)]


def false_slash_rate(method, p, alpha, T, trials, seed=0, **kw):
    """Fraction of honest verifiers (true rate p) ever slashed within T steps."""
    if method not in METHODS:
        raise ValueError(f"unknown method {method!r}; one of {METHODS}")
    if method == "lr" and "q" not in kw:
        raise ValueError("method 'lr' needs q=")
    rng = random.Random(seed)
    hits = 0
    for _ in range(trials):
        hits += _run(method, _draw(rng, T, p), p, alpha, **kw) is not None
    return hits / trials


def detection_times(method, p, q, alpha, T, trials, seed=1, **kw):
    """Stopping times (None => not slashed by T) of a verifier whose true rate is q > p."""
    if method not in ("lr", "mixture"):
        raise ValueError(f"unknown method {method!r}; one of ('lr', 'mixture')")
    rng = random.Random(seed)
    if method == "lr": kw = {"q": q}
    return [_run(method, _draw(rng, T, q), p, alpha, **kw) for _ in range(trials)]


def _first_stop_s(method, t, p, alpha, **kw):
    """Smallest s in [0, t] at which `stopped` fires (t+1 if none). The one-sided
    statistics are increasing in s, so the stopping set at time t is {s >= s*}."""
    if not stopped(method, t, t, p, alpha, **kw): return t + 1
    lo, hi = 0, t
    while lo < hi:
        mid = (lo + hi) // 2
        if stopped(method, t, mid, p, alpha, **kw): hi = mid
        else: lo = mid + 1
    return lo


def exact_stop_dist(method, p, alpha, T, true_rate=None, **kw):
    """Exact P(tau = t) for t = 1..T when outcomes are i.i.d. Bernoulli(true_rate)
    (default: p, the honest verifier).  Dynamic program over (t, s) using `stopped`."""
    _check(method, p, alpha, **kw)
    r = p if true_rate is None else true_rate
    _prob("true_rate", r)
    f = [1.0]                      # f[s]: P(not stopped, s faults) after t steps
    out = []
    for t in range(1, T + 1):
        g = [0.0] * (t + 1)
        for s, v in enumerate(f):
            if v:
                g[s] += v * (1 - r); g[s + 1] += v * r
        k = _first_stop_s(method, t, p, alpha, **kw)
        out.append(sum(g[k:]))
        for s in range(k, t + 1): g[s] = 0.0
        f = g
    return out


def frac_grid(K=32, spacing="uniform"):
    """Bet fractions c in (0, 1): the bet is c/p_t up, or c/(1-p_t) down, so every
    factor stays positive whatever p_t is."""
    return _fracs(K, spacing)


def mixture_tv_path(ys, ps, K=32, two_sided=False, spacing="uniform"):
    """Yield ln M_t, t = 1, 2, ..., of the time-varying mixture e-process.

    Under H0 (y_t ~ Bernoulli(p_t) given the past, p_t announced before y_t) each
    factor 1 + c (y_t - p_t) / p_t has conditional mean one and is >= 1 - c > 0,
    so each product is a test martingale and so is their average (Ville applies).
    With two_sided, the down-bets 1 - c (y_t - p_t) / (1 - p_t) are added and the
    two halves averaged, which also catches a verifier that over-reports faults.
    """
    cs = frac_grid(K, spacing)
    up = [0.0] * K
    dn = [0.0] * K
    n = 2 * K if two_sided else K
    for y, p in zip(ys, ps):
        _check_rate(p, "p_t")
        for i, c in enumerate(cs):
            up[i] += math.log(1 + c * (y - p) / p)
            if two_sided: dn[i] += math.log(1 - c * (y - p) / (1 - p))
        ws = up + dn if two_sided else up
        m = max(ws)
        yield m + math.log(sum(math.exp(w - m) for w in ws) / n)


def run_mixture_tv(ys, ps, alpha, K=32, two_sided=False, spacing="uniform"):
    """First t with the time-varying mixture (mixture_tv_path) >= 1/alpha, else None."""
    _check_alpha(alpha)
    thr = math.log(1 / alpha)
    for t, lm in enumerate(mixture_tv_path(ys, ps, K, two_sided, spacing), 1):
        if lm >= thr: return t
    return None
