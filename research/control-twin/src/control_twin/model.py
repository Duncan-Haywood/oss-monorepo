"""A scalar LQR controller designed inside a digital twin whose actuator gain is wrong.
Real plant x' = a x + b u + w (w ~ N(0,W)), cost per step q x^2 + r u^2.  The twin has (at, bt); the controller
is u = -Kt x with Kt the twin's Riccati gain.  Under any fixed gain K the closed loop is x' = (a - bK) x + w, so
the real average cost is exact: (q + r K^2) W / (1 - (a - bK)^2) if |a - bK| < 1, else infinite."""
import math, random

__all__ = ["riccati_P", "lqr_gain", "opt_cost", "cost", "twin_claim", "regret", "stable", "unstable_bands",
           "simulate_cost", "dither_cost", "info_cov", "identify", "ce_regret", "regret_hessian", "predicted_regret"]


def riccati_P(a, b, q, r):
    """Positive root of b^2 P^2 + (r(1-a^2) - q b^2) P - q r = 0 (scalar DARE)."""
    B = r * (1.0 - a * a) - q * b * b
    return (-B + math.sqrt(B * B + 4.0 * b * b * q * r)) / (2.0 * b * b)


def lqr_gain(a, b, q, r):
    P = riccati_P(a, b, q, r)
    return a * b * P / (r + b * b * P)


def opt_cost(a, b, q, r, W):
    return riccati_P(a, b, q, r) * W


def stable(K, a, b):
    return abs(a - b * K) < 1.0


def cost(K, a, b, q, r, W):
    c = a - b * K
    if abs(c) >= 1.0:
        return math.inf
    return (q + r * K * K) * W / (1.0 - c * c)


def twin_claim(at, bt, q, r, W):
    """The cost the twin itself reports for its own optimal controller."""
    return opt_cost(at, bt, q, r, W)


def regret(a, b, q, r, W, at, bt):
    """Real cost of the twin's controller over the real optimum, minus 1 (inf if it destabilises the loop)."""
    K = lqr_gain(at, bt, q, r)
    return cost(K, a, b, q, r, W) / opt_cost(a, b, q, r, W) - 1.0


def unstable_bands(a, b, q, r, lo=1e-6, hi=1e6, grid=4000, iters=100):
    """Twin actuator-gain ratios m = bt/b (at = a) for which the real loop is unstable, as a list of (m_lo, m_hi)
    intervals: a log-grid scan, each edge refined by bisection.  (m_lo = lo / m_hi = hi mean 'to the scan limit'.)"""
    ok = lambda m: stable(lqr_gain(a, m * b, q, r), a, b)
    ms = [lo * (hi / lo) ** (i / grid) for i in range(grid + 1)]
    flags = [ok(m) for m in ms]

    def edge(m_ok, m_bad):
        for _ in range(iters):
            mid = math.sqrt(m_ok * m_bad)
            if ok(mid):
                m_ok = mid
            else:
                m_bad = mid
        return math.sqrt(m_ok * m_bad)

    bands, start = [], None
    for i, f in enumerate(flags):
        if not f and start is None:
            start = lo if i == 0 else edge(ms[i - 1], ms[i])
        if f and start is not None:
            bands.append((start, edge(ms[i], ms[i - 1])))
            start = None
    if start is not None:
        bands.append((start, hi))
    return bands


def simulate_cost(K, a, b, q, r, W, n, rng, burn=200, d=0.0):
    """Average per-step cost of u = -K x + dither(N(0,d^2)) on the real plant (Monte Carlo)."""
    x, tot = 0.0, 0.0
    sw = math.sqrt(W)
    for k in range(n + burn):
        u = -K * x + (rng.gauss(0, d) if d > 0 else 0.0)
        if k >= burn:
            tot += q * x * x + r * u * u
        x = a * x + b * u + rng.gauss(0, sw)
    return tot / n


def dither_cost(K, a, b, q, r, W, d):
    """Exact average cost while running u = -K x + dither of std d (stable loop)."""
    c = a - b * K
    V = (W + b * b * d * d) / (1.0 - c * c)
    return q * V + r * (K * K * V + d * d)


def info_cov(K, a, b, W, d, n):
    """Asymptotic covariance of the least-squares estimate of (a, b) from n steps of u = -K x + dither(d).
    Returns ((var_a, cov_ab), (cov_ab, var_b)); infinite if d = 0 (a and b are not separately identifiable)."""
    if d <= 0:
        return math.inf
    c = a - b * K
    V = (W + b * b * d * d) / (1.0 - c * c)
    va = W * (K * K * V + d * d) / (n * V * d * d)
    vb = W / (n * d * d)
    cab = W * K / (n * d * d)
    return ((va, cab), (cab, vb))


def identify(K, a, b, W, d, n, rng, burn=200):
    """Run the loop with dither, regress x' on (x, u); returns (a_hat, b_hat) or None if singular."""
    x = 0.0
    sw = math.sqrt(W)
    sxx = sxu = suu = sxy = suy = 0.0
    for k in range(n + burn):
        u = -K * x + (rng.gauss(0, d) if d > 0 else 0.0)
        y = a * x + b * u + rng.gauss(0, sw)
        if k >= burn:
            sxx += x * x; sxu += x * u; suu += u * u; sxy += x * y; suy += u * y
        x = y
    det = sxx * suu - sxu * sxu
    if det <= 1e-9 * max(sxx * suu, 1e-30):
        return None
    ah = (suu * sxy - sxu * suy) / det
    bh = (sxx * suy - sxu * sxy) / det
    return ah, bh


def ce_regret(a, b, q, r, W, ah, bh):
    """Real regret of the certainty-equivalent controller designed for (ah, bh)."""
    if bh == 0:
        return math.inf
    K = lqr_gain(ah, bh, q, r)
    return cost(K, a, b, q, r, W) / opt_cost(a, b, q, r, W) - 1.0


def regret_hessian(a, b, q, r, W, h=1e-4):
    """Numerical Hessian of ce_regret in (ah, bh) at the truth (its gradient is zero there)."""
    f = lambda x, y: ce_regret(a, b, q, r, W, x, y)
    f0 = f(a, b)
    haa = (f(a + h, b) - 2 * f0 + f(a - h, b)) / h ** 2
    hbb = (f(a, b + h) - 2 * f0 + f(a, b - h)) / h ** 2
    hab = (f(a + h, b + h) - f(a + h, b - h) - f(a - h, b + h) + f(a - h, b - h)) / (4 * h * h)
    return haa, hab, hbb


def predicted_regret(K, a, b, q, r, W, d, n):
    """Delta-method mean regret 1/2 tr(H Sigma) of the certainty-equivalent retune after n dithered steps."""
    (va, cab), (_, vb) = info_cov(K, a, b, W, d, n)
    haa, hab, hbb = regret_hessian(a, b, q, r, W)
    return 0.5 * (haa * va + 2 * hab * cab + hbb * vb)
