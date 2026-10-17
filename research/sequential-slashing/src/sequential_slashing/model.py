"""Anytime-valid slashing of a verifier that reports fault probability p.

H0: the verifier is calibrated, y_t ~ Bernoulli(p).  A slashing rule must not
punish honest verifiers more than alpha of the time *however often it looks*.
"""
import math, random

__all__ = ["kl", "lr_step", "bet_step", "run_lr", "run_mixture", "run_ztest_peeking",
           "wald_lower", "mixture_grid", "false_slash_rate", "detection_times"]


def kl(q, p):
    """Bernoulli KL(q||p) in nats."""
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
    return math.log(1 / alpha) / kl(q, p)


def mixture_grid(p, K=64):
    """Uniform grid of positive bets (one-sided: verifier faults more than claimed)."""
    top = 1 / p
    return [top * (k + 0.5) / K for k in range(K)]


def run_lr(ys, p, q, alpha):
    """Return first t with LR e-process >= 1/alpha, else None."""
    lg, thr = 0.0, math.log(1 / alpha)
    for t, y in enumerate(ys, 1):
        lg += math.log(lr_step(y, p, q))
        if lg >= thr: return t
    return None


def run_mixture(ys, p, alpha, K=64):
    """Uniform mixture over bet sizes: needs no knowledge of q."""
    lams = mixture_grid(p, K)
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
    rng = random.Random(seed)
    hits = 0
    for _ in range(trials):
        ys = _draw(rng, T, p)
        if method == "z": r = run_ztest_peeking(ys, p, alpha)
        elif method == "mixture": r = run_mixture(ys, p, alpha, **kw)
        else: r = run_lr(ys, p, kw["q"], alpha)
        hits += r is not None
    return hits / trials


def detection_times(method, p, q, alpha, T, trials, seed=1, **kw):
    """Stopping times (None => not slashed by T) of a verifier whose true rate is q > p."""
    rng = random.Random(seed)
    out = []
    for _ in range(trials):
        ys = _draw(rng, T, q)
        if method == "mixture": out.append(run_mixture(ys, p, alpha, **kw))
        else: out.append(run_lr(ys, p, q, alpha))
    return out
