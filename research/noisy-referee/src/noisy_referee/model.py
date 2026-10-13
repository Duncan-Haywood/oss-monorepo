"""Scoring a binary claim against a noisy referee. Truth Y in {0,1}; the referee's label Yt flips with
e0 = P(Yt=1|Y=0), e1 = P(Yt=0|Y=1); gamma = 1-e0-e1 > 0. A verifier with belief p=P(Y=1) reports r."""
import math, random

__all__ = ["noisy_prob", "loss", "surrogate", "expected_raw", "expected_surrogate", "best_report_raw",
           "best_report_surrogate", "payment_range", "diff_moments", "sample_size_ratio",
           "raw_truthful_score", "reversal_eta", "misreport_bias", "gold_rates", "misspec_excess_mc"]


def noisy_prob(p, e0, e1):
    """P(Yt=1) when P(Y=1)=p."""
    return e0 + (1 - e0 - e1) * p


def loss(r, y, rule="brier"):
    if rule == "brier":
        return (r - y) ** 2
    r = min(max(r, 1e-12), 1 - 1e-12)
    return -math.log(r if y == 1 else 1 - r)


def surrogate(r, yt, e0, e1, rule="brier"):
    """Unbiased surrogate loss: E[surrogate(r,Yt)|Y=y] = loss(r,y) for both y (needs gamma>0)."""
    g = 1 - e0 - e1
    if yt == 1:
        return ((1 - e0) * loss(r, 1, rule) - e1 * loss(r, 0, rule)) / g
    return ((1 - e1) * loss(r, 0, rule) - e0 * loss(r, 1, rule)) / g


def expected_raw(r, p, e0, e1, rule="brier"):
    q = noisy_prob(p, e0, e1)
    return q * loss(r, 1, rule) + (1 - q) * loss(r, 0, rule)


def expected_surrogate(r, p, e0, e1, eh0, eh1, rule="brier"):
    """Expected surrogate loss built with assumed rates (eh0, eh1) when the true rates are (e0, e1).
    Equals w*loss(r,1)+(1-w)*loss(r,0) with w = (e0-eh0+gamma p)/gamma_hat."""
    q = noisy_prob(p, e0, e1)
    return q * surrogate(r, 1, eh0, eh1, rule) + (1 - q) * surrogate(r, 0, eh0, eh1, rule)


def best_report_raw(p, e0, e1):
    """A raw proper score against Yt is minimised at the noisy probability (affine distortion)."""
    return noisy_prob(p, e0, e1)


def best_report_surrogate(p, e0, e1, eh0, eh1):
    """Minimiser of the surrogate built with assumed rates: w clipped to [0,1] (equals p if rates are right)."""
    w = (e0 - eh0 + (1 - e0 - e1) * p) / (1 - eh0 - eh1)
    return min(max(w, 0.0), 1.0)


def misreport_bias(p, e0, e1, eh0, eh1):
    """Unclipped bias w - p of the surrogate's optimal report."""
    return (e0 - eh0 + (1 - e0 - e1) * p) / (1 - eh0 - eh1) - p


def payment_range(e0, e1, rule="brier"):
    """(min, max) of the Brier surrogate over r in [0,1], yt in {0,1}."""
    vals = [surrogate(r / 200, yt, e0, e1, rule) for r in range(201) for yt in (0, 1)]
    return min(vals), max(vals)


def diff_moments(r1, r2, pi, e0, e1, rule="brier", noisy=True):
    """Exact mean and variance of loss(r1)-loss(r2) with Y~Bern(pi): clean (noisy=False) or surrogate."""
    m = v = 0.0
    for y, py in ((1, pi), (0, 1 - pi)):
        if not noisy:
            d = loss(r1, y, rule) - loss(r2, y, rule)
            m += py * d; v += py * d * d
            continue
        for yt in (0, 1):
            pt = ((1 - e1) if yt == 1 else e1) if y == 1 else (e0 if yt == 1 else 1 - e0)
            d = surrogate(r1, yt, e0, e1, rule) - surrogate(r2, yt, e0, e1, rule)
            m += py * pt * d; v += py * pt * d * d
    return m, v - m * m


def sample_size_ratio(r1, r2, pi, e0, e1, rule="brier"):
    """n needed with surrogate scores / n needed with clean labels to reach the same z-score."""
    m0, v0 = diff_moments(r1, r2, pi, e0, e1, rule, noisy=False)
    m1, v1 = diff_moments(r1, r2, pi, e0, e1, rule, noisy=True)
    assert abs(m0 - m1) < 1e-9
    return v1 / v0


def raw_truthful_score(dist, e0, e1, rule="brier"):
    """Expected raw score of a truthful verifier whose belief has discrete law dist=[(p, prob),...]."""
    return sum(w * expected_raw(p, p, e0, e1, rule) for p, w in dist)


def reversal_eta(A, B, rule="brier", pi=None):
    """Smallest symmetric noise eta at which the raw score prefers B (low resolution) to A (high)."""
    lo, hi = 0.0, 0.499
    f = lambda t: raw_truthful_score(A, t, t, rule) - raw_truthful_score(B, t, t, rule)
    if f(lo) >= 0:
        return None
    if f(hi) < 0:
        return math.inf
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
    return (lo + hi) / 2


def gold_rates(e0, e1, m, rng):
    """Estimate (e0,e1) from m gold-checked items of each class; returns (eh0, eh1)."""
    eh0 = sum(rng.random() < e0 for _ in range(m)) / m
    eh1 = sum(rng.random() < e1 for _ in range(m)) / m
    return eh0, eh1


def misspec_excess_mc(e0, e1, m, trials, seed=0):
    """Mean true-Brier excess (bias^2) when verifiers optimise a surrogate built from m gold labels per
    class, p uniform on a grid. Returns (mean excess, first-order prediction)."""
    rng = random.Random(seed)
    ps = [(i + 0.5) / 50 for i in range(50)]
    tot = n = 0
    for _ in range(trials):
        eh0, eh1 = gold_rates(e0, e1, m, rng)
        if 1 - eh0 - eh1 <= 0.05:
            continue
        for p in ps:
            tot += misreport_bias(p, e0, e1, eh0, eh1) ** 2; n += 1
    g = 1 - e0 - e1
    # w - p ~ [(e0-eh0) + (e0+e1... )]: delta method with Var(eh0)=e0(1-e0)/m, Var(eh1)=e1(1-e1)/m
    mp = sum((p ** 2) for p in ps) / len(ps)
    mp1 = sum(ps) / len(ps)
    v0, v1 = e0 * (1 - e0) / m, e1 * (1 - e1) / m
    # w-p = [(e0-eh0) + (eh0+eh1-e0-e1)p]/gh ; coefficient of eh0: (p-1), of eh1: p  (over gamma)
    pred = (v0 * sum((1 - p) ** 2 for p in ps) + v1 * mp * len(ps)) / len(ps) / g ** 2
    return tot / n, pred
