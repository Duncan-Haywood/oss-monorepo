"""Sequential comparison of two verifiers' probability reports rA, rB (fixed, binary outcome Y~Bern(q)) under Brier loss.
Score difference D=(rB-Y)^2-(rA-Y)^2 in [-1,1]; D>0 means A is better. Two-point: d1 (Y=1), d0 (Y=0).
H0: E D <= 0 (A no better). Betting e-process K_t = prod(1+lam D_s), lam in [0,1): a supermartingale under H0."""
import math
import random

__all__ = ["diffs", "mean_diff", "breakeven", "growth", "best_bet", "max_growth", "kl", "delay_prediction",
           "small_gap_growth", "run_bet", "run_mixture", "mixture_log_e", "peeking_ztest", "simulate"]


def diffs(rA, rB):
    """(d1, d0): score difference when Y=1 and Y=0."""
    return (1 - rB) ** 2 - (1 - rA) ** 2, rB ** 2 - rA ** 2


def mean_diff(rA, rB, q):
    d1, d0 = diffs(rA, rB)
    return q * d1 + (1 - q) * d0


def breakeven(rA, rB):
    """pi: the outcome frequency at which E D = 0, pi = d0/(d0-d1) = (rA+rB)/2 (midpoint of the reports)."""
    return (rA + rB) / 2


def growth(lam, rA, rB, q):
    """Expected log-growth per task of the fixed bet lam."""
    d1, d0 = diffs(rA, rB)
    return q * math.log(1 + lam * d1) + (1 - q) * math.log(1 + lam * d0)


def best_bet(rA, rB, q):
    """lam* = -mu/(d0 d1), clipped to the admissible interval (lam*d>-1 for both d)."""
    d1, d0 = diffs(rA, rB)
    mu = q * d1 + (1 - q) * d0
    if d0 * d1 >= 0:
        return 0.0
    lam = -mu / (d0 * d1)
    hi = min(1 / abs(d) for d in (d0, d1) if d < 0)
    return max(0.0, min(lam, hi * (1 - 1e-12)))


def kl(q, pi):
    return q * math.log(q / pi) + (1 - q) * math.log((1 - q) / (1 - pi))


def max_growth(rA, rB, q):
    """Growth of the optimal bet = KL(q || pi) when q is on A's side of pi (A better), else 0."""
    pi = breakeven(rA, rB)
    return kl(q, pi) if mean_diff(rA, rB, q) > 0 else 0.0


def small_gap_growth(rA, rB, q):
    pi = breakeven(rA, rB)
    return (q - pi) ** 2 / (2 * pi * (1 - pi))


def delay_prediction(rA, rB, q, alpha):
    """Expected stopping time ~ ln(1/alpha)/KL(q||pi)."""
    return math.log(1 / alpha) / max_growth(rA, rB, q)


def run_bet(ys, rA, rB, lam):
    """log K_t path for a fixed bet."""
    d1, d0 = diffs(rA, rB)
    out, s = [], 0.0
    for y in ys:
        s += math.log(1 + lam * (d1 if y else d0))
        out.append(s)
    return out


def mixture_log_e(ys, rA, rB, lams):
    """Log of the uniform mixture over a grid of fixed bets: a valid e-process (average of e-processes)."""
    d1, d0 = diffs(rA, rB)
    logs = [0.0] * len(lams)
    out = []
    for y in ys:
        d = d1 if y else d0
        logs = [l + math.log(1 + lam * d) for l, lam in zip(logs, lams)]
        m = max(logs)
        out.append(m + math.log(sum(math.exp(l - m) for l in logs) / len(lams)))
    return out


def run_mixture(rA, rB, q, alpha, lams, T, rng):
    """First time the mixture e-process crosses 1/alpha, or None."""
    d1, d0 = diffs(rA, rB)
    logs = [0.0] * len(lams)
    thr = math.log(1 / alpha)
    for t in range(1, T + 1):
        d = d1 if rng.random() < q else d0
        logs = [l + math.log(1 + lam * d) for l, lam in zip(logs, lams)]
        m = max(logs)
        if m + math.log(sum(math.exp(l - m) for l in logs) / len(lams)) >= thr:
            return t
    return None


def peeking_ztest(rA, rB, q, z, T, rng, start=20):
    """Reject at the first t>=start with sqrt(t)*mean/sd > z, using the running sample sd."""
    d1, d0 = diffs(rA, rB)
    n = s = s2 = 0.0
    for t in range(1, T + 1):
        d = d1 if rng.random() < q else d0
        n += 1; s += d; s2 += d * d
        if t >= start:
            var = s2 / n - (s / n) ** 2
            if var > 1e-15 and s / n / math.sqrt(var / n) > z:
                return t
    return None


def simulate(rA, rB, q, alpha, lams, T, reps, seed, test="e"):
    """(rejection fraction, mean stopping time among rejections)."""
    rng = random.Random(seed)
    z = {0.05: 1.645, 0.01: 2.326}[alpha]
    times = [run_mixture(rA, rB, q, alpha, lams, T, rng) if test == "e" else peeking_ztest(rA, rB, q, z, T, rng)
             for _ in range(reps)]
    hit = [t for t in times if t is not None]
    return len(hit) / reps, (sum(hit) / len(hit) if hit else float("nan"))
