"""Scalar linear-quadratic twin transfer. Plant x' = a x + b u + w, w ~ N(0, s2); cost q x^2 + r u^2 per step; policy u = -k x."""
import math, random

__all__ = ["closed_loop", "cost", "riccati_p", "optimal_gain", "regret", "cost_curvature", "gain_sensitivity",
           "twin_gain", "twin_regret", "local_regret", "stability_cliff",
           "stationary_moments", "score_gap", "score_gap_closed_loop", "blind_direction",
           "shrink_mse", "kappa_star", "n_eff", "samples_needed", "simulate_cost", "simulate_shrinkage"]


def closed_loop(a, b, k):
    return a - b * k


def cost(a, b, k, q=1.0, r=0.1, s2=1.0):
    """Average cost per step of gain k on plant (a, b): s2 (q + r k^2)/(1 - c^2), infinite when |c| >= 1."""
    c = closed_loop(a, b, k)
    return math.inf if abs(c) >= 1 else s2 * (q + r * k * k) / (1 - c * c)


def riccati_p(a, b, q=1.0, r=0.1):
    """Positive root of b^2 p^2 + (r(1-a^2) - q b^2) p - q r = 0 (scalar DARE)."""
    B = r * (1 - a * a) - q * b * b
    return (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)


def optimal_gain(a, b, q=1.0, r=0.1):
    p = riccati_p(a, b, q, r)
    return a * b * p / (r + b * b * p)


def regret(a, b, k, q=1.0, r=0.1, s2=1.0):
    return cost(a, b, k, q, r, s2) - cost(a, b, optimal_gain(a, b, q, r), q, r, s2)


def cost_curvature(a, b, q=1.0, r=0.1, s2=1.0, h=1e-4):
    ks = optimal_gain(a, b, q, r)
    f = lambda k: cost(a, b, k, q, r, s2)
    return (f(ks + h) - 2 * f(ks) + f(ks - h)) / (h * h)


def gain_sensitivity(a, b, q=1.0, r=0.1, h=1e-5):
    """dk*/db at fixed a by central difference."""
    return (optimal_gain(a, b + h, q, r) - optimal_gain(a, b - h, q, r)) / (2 * h)


def twin_gain(ah, bh, q=1.0, r=0.1):
    """Certainty-equivalent controller trained in the twin (ah, bh)."""
    return optimal_gain(ah, bh, q, r)


def twin_regret(a, b, ah, bh, q=1.0, r=0.1, s2=1.0):
    """Deployment regret on the plant of the controller trained in the twin."""
    return regret(a, b, twin_gain(ah, bh, q, r), q, r, s2)


def local_regret(a, b, bh, q=1.0, r=0.1, s2=1.0):
    """Second-order prediction 1/2 J''(k*) (dk*/db)^2 (b_hat - b)^2, valid for a known and small error."""
    return 0.5 * cost_curvature(a, b, q, r, s2) * gain_sensitivity(a, b, q, r) ** 2 * (bh - b) ** 2


def stability_cliff(a, b, k):
    """Largest multiplicative input-gain error m with |a - m b k| < 1 for m in (0, m*): m* = (1+a)/(b k) (k>0, b>0, a>-1)."""
    return (1 + a) / (b * k)


def stationary_moments(a, b, kb, v, s2=1.0):
    """Behaviour policy u = -kb x + e, e ~ N(0, v). Returns (E x^2, E u^2, E x u)."""
    c = a - b * kb
    vx = (s2 + b * b * v) / (1 - c * c)
    return vx, kb * kb * vx + v, -kb * vx


def score_gap(a, b, ah, bh, kb, v, s2=1.0):
    """Expected per-step log-score excess (KL) of the twin's one-step predictive N(ah x + bh u, s2), data from the behaviour policy."""
    da, db = ah - a, bh - b
    exx, euu, exu = stationary_moments(a, b, kb, v, s2)
    return (da * da * exx + 2 * da * db * exu + db * db * euu) / (2 * s2)


def score_gap_closed_loop(a, b, ah, bh, k, s2=1.0):
    """Validation on the deployed policy itself (v = 0): the gap only sees (da - k db)^2 E x^2 / (2 s2)."""
    return score_gap(a, b, ah, bh, k, 0.0, s2)


def blind_direction(a, b, ah, k):
    """Twin input gain bh with da = k db, i.e. zero closed-loop score gap at gain k while bh != b."""
    return b + (ah - a) / k


def shrink_mse(delta, sig2, S, kappa):
    """MSE of b_hat = (sum u y + kappa b0)/(S + kappa), S = sum u^2, twin bias delta = b0 - b, y = b u + w, Var w = sig2."""
    return (sig2 * S + kappa * kappa * delta * delta) / (S + kappa) ** 2


def kappa_star(delta, sig2):
    return sig2 / (delta * delta)


def n_eff(delta, sig2, v):
    """Worth of the twin in real transitions with input variance v per step: kappa*/v = sig2/(v delta^2)."""
    return kappa_star(delta, sig2) / v


def samples_needed(delta, sig2, v, target_mse, kappa=None):
    """Real transitions to reach an MSE target. kappa=None uses the optimal pseudo-count; kappa=0 ignores the twin."""
    kap = kappa_star(delta, sig2) if kappa is None else kappa
    if kappa is None or kappa == kap:
        return max(0.0, (sig2 / target_mse - kap) / v)
    lo, hi = 0.0, 1e12
    for _ in range(200):
        mid = (lo + hi) / 2
        if shrink_mse(delta, sig2, mid * v, kappa) > target_mse:
            lo = mid
        else:
            hi = mid
    return hi


def simulate_cost(a, b, k, q, r, s2, T, burn, seed):
    rng = random.Random(seed)
    sd, x, tot = math.sqrt(s2), 0.0, 0.0
    for t in range(T + burn):
        u = -k * x
        if t >= burn:
            tot += q * x * x + r * u * u
        x = a * x + b * u + rng.gauss(0, sd)
    return tot / T


def simulate_shrinkage(a, b, b0, kappa, n, v, q, r, s2, trials, seed):
    """Monte Carlo of the twin-regularised estimate of b (a known), alternating +-sqrt(v) probes. Returns (mean MSE, mean regret, diverged fraction)."""
    rng = random.Random(seed)
    sd, su = math.sqrt(s2), math.sqrt(v)
    mse = reg = 0.0
    bad = 0
    for _ in range(trials):
        num = 0.0
        for t in range(n):
            u = su if t % 2 == 0 else -su
            num += u * (b * u + rng.gauss(0, sd))
        bh = (num + kappa * b0) / (n * v + kappa)
        mse += (bh - b) ** 2
        rg = regret(a, b, optimal_gain(a, bh, q, r), q, r, s2) if bh > 0.02 else math.inf
        if math.isinf(rg):
            bad += 1
        else:
            reg += rg
    return mse / trials, reg / max(1, trials - bad), bad / trials
