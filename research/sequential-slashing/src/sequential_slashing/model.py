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
           "log_lr", "log_mixture", "stopped", "exact_stop_dist", "exact_false_slash",
           "exact_detection", "mixture_fractions", "run_mixture_varying",
           "mixture_varying_factors", "wilson"]

METHODS = ("lr", "mixture", "z")


def _prob(name, x):
    if not (isinstance(x, (int, float)) and 0 < x < 1):
        raise ValueError(f"{name} must be a probability strictly between 0 and 1, got {x!r}")


def _alpha(alpha):
    if not (isinstance(alpha, (int, float)) and 0 < alpha < 1):
        raise ValueError(f"alpha must be in (0, 1), got {alpha!r}")


def _pq(p, q):
    _prob("p", p); _prob("q", q)
    if q <= p:
        raise ValueError(f"the one-sided LR test needs q > p (a cheater under-reports faults); got p={p}, q={q}")


def kl(q, p):
    """Bernoulli KL(q||p) in nats."""
    _prob("p", p)
    if not 0 <= q <= 1: raise ValueError(f"q must be in [0, 1], got {q!r}")
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
    """Wald's lower bound on E[tau] for any level-alpha sequential test (ignoring the
    power term): ln(1/alpha)/KL(q||p)."""
    _alpha(alpha)
    return math.log(1 / alpha) / kl(q, p)


def mixture_fractions(K=64):
    """Midpoint grid of betting fractions c in (0, 1)."""
    if not (isinstance(K, int) and K >= 1): raise ValueError(f"K must be a positive int, got {K!r}")
    return [(k + 0.5) / K for k in range(K)]


def mixture_grid(p, K=64):
    """Uniform grid of positive bets lam = c/p (one-sided: verifier faults more than claimed)."""
    _prob("p", p)
    return [c / p for c in mixture_fractions(K)]


def _logmeanexp(xs):
    m = max(xs)
    if m == -math.inf: return m
    return m + math.log(sum(math.exp(x - m) for x in xs) / len(xs))


def log_lr(t, s, p, q):
    """log of the LR e-process after t outcomes with s faults."""
    return s * math.log(q / p) + (t - s) * math.log((1 - q) / (1 - p))


def log_mixture(t, s, p, K=64):
    """log of the uniform mixture over bets lam in mixture_grid(p, K) after t outcomes, s faults."""
    out = []
    for c in mixture_fractions(K):
        up, down = 1 + c * (1 - p) / p, 1 - c   # factors at y=1 and y=0 for lam = c/p
        out.append(s * math.log(up) + (t - s) * math.log(down))
    return _logmeanexp(out)


def stopped(method, t, s, p, alpha, q=None, K=64, t0=30):
    """The shared decision rule: does `method` slash after t outcomes with s faults?"""
    if method == "lr":
        return log_lr(t, s, p, q) >= math.log(1 / alpha)
    if method == "mixture":
        return log_mixture(t, s, p, K) >= math.log(1 / alpha)
    if method == "z":
        z = NormalDist().inv_cdf(1 - alpha)
        return t >= t0 and (s - t * p) / (math.sqrt(p * (1 - p)) * math.sqrt(t)) >= z
    raise ValueError(f"unknown method {method!r}; expected one of {METHODS}")


def _check(method, p, alpha, q=None, **kw):
    if method not in METHODS: raise ValueError(f"unknown method {method!r}; expected one of {METHODS}")
    _alpha(alpha)
    if method == "lr": _pq(p, q)
    else: _prob("p", p)


def _run(method, ys, p, alpha, **kw):
    s = 0
    for t, y in enumerate(ys, 1):
        s += 1 if y else 0
        if stopped(method, t, s, p, alpha, **kw): return t
    return None


def run_lr(ys, p, q, alpha):
    """Return first t with LR e-process >= 1/alpha, else None."""
    _check("lr", p, alpha, q=q)
    return _run("lr", ys, p, alpha, q=q)


def run_mixture(ys, p, alpha, K=64):
    """Uniform mixture over bet sizes: needs no knowledge of q."""
    _check("mixture", p, alpha)
    return _run("mixture", ys, p, alpha, K=K)


def run_ztest_peeking(ys, p, alpha, t0=30):
    """Fixed-sample one-sided z-test, naively re-run at every step from t0. Returns first rejection."""
    _check("z", p, alpha)
    return _run("z", ys, p, alpha, t0=t0)


def _draw(rng, n, q):
    return [1 if rng.random() < q else 0 for _ in range(n)]


def false_slash_rate(method, p, alpha, T, trials, seed=0, **kw):
    """Monte Carlo fraction of honest verifiers (true rate p) ever slashed within T steps."""
    _check(method, p, alpha, **kw)
    rng = random.Random(seed)
    hits = 0
    for _ in range(trials):
        hits += _run(method, _draw(rng, T, p), p, alpha, **kw) is not None
    return hits / trials


def detection_times(method, p, q, alpha, T, trials, seed=1, **kw):
    """Stopping times (None => not slashed by T) of a verifier whose true rate is q > p."""
    if method not in ("lr", "mixture"): raise ValueError(f"unknown method {method!r}")
    _pq(p, q); _alpha(alpha)
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


def exact_false_slash(method, p, alpha, T, **kw):
    """Exact probability that an honest verifier (rate p) is slashed within T steps."""
    return sum(exact_stop_dist(method, p, alpha, T, **kw))


def exact_detection(method, p, q, alpha, T, **kw):
    """(P(slashed by T), E[tau | slashed by T]) for a cheater with true rate q, exact."""
    if method == "lr": kw = {"q": q}
    d = exact_stop_dist(method, p, alpha, T, true_rate=q, **kw)
    P = sum(d)
    return P, (sum(t * v for t, v in enumerate(d, 1)) / P if P else math.nan)


def mixture_varying_factors(y, p, c, side):
    """Betting factor for fraction c in (0,1) against a report p for one outcome.
    side 'greater' bets that faults exceed p (lam = c/p); 'less' that they fall short
    (lam = -c/(1-p)).  Each has mean one under y ~ Bern(p)."""
    if side == "greater": return 1 + c * (y - p) / p
    if side == "less": return 1 - c * (y - p) / (1 - p)
    raise ValueError(f"side must be 'greater' or 'less', got {side!r}")


def run_mixture_varying(ys, ps, alpha, K=32, side="greater"):
    """Mixture e-process for per-round reports ps[t] (predictable: fixed before y_t).
    side: 'greater' (under-reported faults), 'less' (over-reported) or 'two-sided'
    (the average of the two mixtures, still an e-process).  First t with E_t >= 1/alpha."""
    _alpha(alpha)
    if side not in ("greater", "less", "two-sided"): raise ValueError(f"unknown side {side!r}")
    if len(ps) < len(ys): raise ValueError("need one report p_t per outcome")
    cs = mixture_fractions(K)
    sides = ("greater", "less") if side == "two-sided" else (side,)
    lw = {sd: [0.0] * K for sd in sides}
    thr = math.log(1 / alpha)
    for t, (y, p) in enumerate(zip(ys, ps), 1):
        _prob("p_t", p)
        for sd in sides:
            w = lw[sd]
            for i, c in enumerate(cs): w[i] += math.log(mixture_varying_factors(y, p, c, sd))
        e = _logmeanexp([x for sd in sides for x in lw[sd]])
        if e >= thr: return t
    return None


def wilson(k, n, z=1.959964):
    """Wilson score interval for a binomial proportion k/n."""
    if n == 0: return (0.0, 1.0)
    ph = k / n
    d = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / d
    h = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))
