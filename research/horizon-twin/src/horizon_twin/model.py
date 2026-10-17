"""Receding-horizon (MPC-style) control designed in a digital twin with the wrong plant pole.

Real plant  x' = a x + b u + w,  w ~ N(0, W),  cost per step q x^2 + r u^2.
The twin believes the pole is a_t (b known).  An H-step controller solves the twin's
finite-horizon LQ problem with terminal cost PT and applies the first gain K_H(a_t);
for a scalar plant this is a fixed linear gain, so its real cost is exact:
    J = (q + r K^2) W / (1 - (a - b K)^2)   if |a - bK| < 1, else infinity.
"""
import math, random

__all__ = ["gain", "gains", "cost", "claim", "regret", "opt_cost", "riccati_gain",
           "best_horizon", "h2_gain", "unstable_horizons", "simulate_cost", "edge"]


def gains(a_t, b, q, r, H, PT=0.0):
    """[K_1, ..., K_H]: first gains of the 1..H step twin problems (K_1 = a b PT/(r+b^2 PT))."""
    P, out = PT, []
    for _ in range(H):
        K = a_t * b * P / (r + b * b * P)
        P = q + a_t * a_t * P - a_t * b * P * K
        out.append(K)
    return out


def gain(a_t, b, q, r, H, PT=0.0):
    return gains(a_t, b, q, r, H, PT)[-1]


def riccati_gain(a, b, q, r, iters=100000, tol=1e-15):
    P = q
    for _ in range(iters):
        K = a * b * P / (r + b * b * P)
        Pn = q + a * a * P - a * b * P * K
        if abs(Pn - P) < tol * max(1.0, abs(P)):
            P = Pn
            break
        P = Pn
    return a * b * P / (r + b * b * P)


def cost(K, a, b, q, r, W=1.0):
    ac = a - b * K
    return (q + r * K * K) * W / (1 - ac * ac) if abs(ac) < 1 else math.inf


def opt_cost(a, b, q, r, W=1.0):
    return cost(riccati_gain(a, b, q, r), a, b, q, r, W)


def claim(K, a_t, b, q, r, W=1.0):
    """What the twin itself reports for gain K (its own closed-loop cost)."""
    return cost(K, a_t, b, q, r, W)


def regret(K, a, b, q, r, W=1.0):
    return cost(K, a, b, q, r, W) / opt_cost(a, b, q, r, W) - 1


def h2_gain(a_t, b, q, r):
    """Two-step gain with PT = 0: K_2 = a_t b q / (r + b^2 q)."""
    return a_t * b * q / (r + b * b * q)


def best_horizon(a, a_t, b, q, r, Hmax=60, PT=0.0, W=1.0):
    """(H*, J(H*), J(Hmax)) with the real cost evaluated for each horizon 1..Hmax."""
    Ks = gains(a_t, b, q, r, Hmax, PT)
    Js = [cost(K, a, b, q, r, W) for K in Ks]
    m = min(Js)
    i = next(j for j in range(Hmax) if Js[j] <= m * (1 + 1e-9))   # shortest horizon within 1e-9 of the best
    return i + 1, Js[i], Js[-1]


def unstable_horizons(a, a_t, b, q, r, Hmax=60, PT=0.0):
    return [H for H, K in enumerate(gains(a_t, b, q, r, Hmax, PT), 1) if abs(a - b * K) >= 1]


def simulate_cost(K, a, b, q, r, W, n, seed=0, burn=1000):
    rng = random.Random(seed)
    x, tot, s = 0.0, 0.0, math.sqrt(W)
    for t in range(n + burn):
        u = -K * x
        if t >= burn:
            tot += q * x * x + r * u * u
        x = a * x + b * u + s * rng.gauss(0, 1)
    return tot / n


def edge(pred, lo, hi, it=80):
    """Bisection for the boundary of a monotone predicate: pred(lo) True, pred(hi) False."""
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if pred(mid) else (lo, mid)
    return 0.5 * (lo + hi)
