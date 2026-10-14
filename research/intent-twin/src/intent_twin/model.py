"""A robot infers which of two goals a human is heading to from noisy motion cues.

Each step the human's cue points at the true goal with probability p (odds r = p/(1-p)) and at the
other goal otherwise. The robot keeps the running lead S = (#cues for A) - (#cues for B) and commits
to the leading goal when |S| = h (a sequential probability ratio test with equal odds prior; its
log-likelihood ratio is S ln r_s under the twin's assumed p_s). Gambler's ruin gives, for the real p:
    P(wrong goal) = 1/(1 + r^h),   E[T] = h (1 - 2 P(wrong)) / (2p - 1)   (h^2 at p = 1/2).
"""
import math, random

__all__ = ["odds", "err", "exp_time", "design_h", "simulate", "theta", "err_asym",
           "beta_pop_err", "beta_pop_time", "design_h_pop", "phat_design", "demo_design_stats"]


def odds(p):
    return p / (1 - p)


def err(p, h):
    """Exact probability of committing to the wrong goal at threshold h when the real cue accuracy is p."""
    x = h * math.log(odds(p))
    if x > 700:
        return 0.0
    if x < -700:
        return 1.0
    return 1 / (1 + math.exp(x))


def exp_time(p, h):
    """Exact expected number of cues until commitment."""
    if abs(2 * p - 1) < 1e-9:
        return float(h * h)
    return h * (1 - 2 * err(p, h)) / (2 * p - 1)


def design_h(p_s, alpha):
    """Smallest integer threshold whose error is <= alpha in a twin whose human has cue accuracy p_s."""
    if p_s <= 0.5:
        return 10 ** 6
    h = 1
    while err(p_s, h) > alpha:
        h += 1
    return h


def simulate(rng, p, h, trials):
    """Monte Carlo (wrong-goal rate, mean commitment time) for cue accuracy p and threshold h."""
    wrong = tot = 0
    for _ in range(trials):
        s = t = 0
        while abs(s) < h:
            s += 1 if rng.random() < p else -1
            t += 1
        wrong += s < 0
        tot += t
    return wrong / trials, tot / trials


def theta(p, p_s):
    """Error-exponent ratio: real error ~ alpha^theta for a twin designed to alpha with cue accuracy p_s."""
    return math.log(odds(p)) / math.log(odds(p_s))


def err_asym(p, p_s, alpha):
    return alpha ** theta(p, p_s)


def _beta_pdf_grid(a, b, N):
    ps = [(i + 0.5) / N for i in range(N)]
    lc = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    w = [math.exp(lc + (a - 1) * math.log(p) + (b - 1) * math.log(1 - p)) / N for p in ps]
    z = sum(w)
    return ps, [x / z for x in w]


def beta_pop_err(a, b, h, N=20000):
    """Population-average error when humans' cue accuracies are Beta(a, b)."""
    ps, w = _beta_pdf_grid(a, b, N)
    return sum(wi * err(p, h) for p, wi in zip(ps, w))


def beta_pop_time(a, b, h, N=20000):
    ps, w = _beta_pdf_grid(a, b, N)
    return sum(wi * exp_time(p, h) for p, wi in zip(ps, w))


def design_h_pop(a, b, alpha, N=20000):
    """Smallest threshold whose population-average error is <= alpha."""
    ps, w = _beta_pdf_grid(a, b, N)
    h = 1
    while sum(wi * err(p, h) for p, wi in zip(ps, w)) > alpha:
        h += 1
        if h > 2000:
            return None
    return h


def phat_design(k, n, alpha, z=0.0, hcap=10 ** 6):
    """Threshold designed from k of n observed real cues pointing at the true goal.

    Point estimate (k+1)/(n+2) (Laplace); z > 0 uses the lower confidence bound p - z sqrt(p(1-p)/n).
    """
    p = (k + 1) / (n + 2)
    p -= z * math.sqrt(p * (1 - p) / n)
    return min(design_h(p, alpha), hcap) if p > 0.5 else hcap


def demo_design_stats(p, n, alpha, z=0.0, hcap=200):
    """Exact distribution over Binomial(n, p) calibration data of the real error/time of the designed threshold.

    Returns (mean real error, P(real error > alpha), mean real E[T], mean h).
    """
    lp, lq = math.log(p), math.log(1 - p)
    me = pbad = mt = mh = 0.0
    for k in range(n + 1):
        pr = math.exp(math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1) + k * lp + (n - k) * lq)
        h = phat_design(k, n, alpha, z, hcap)
        e = err(p, h)
        me += pr * e
        pbad += pr * (e > alpha)
        mt += pr * exp_time(p, h)
        mh += pr * h
    return me, pbad, mt, mh
