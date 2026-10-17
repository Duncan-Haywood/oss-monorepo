"""Loop-closure gating in a SLAM back end.  A candidate closure yields a k-dimensional residual r.  A true closure has
r ~ N(0, s2 I); a false one (perceptual aliasing) has r ~ N(0, (s2+tau2) I).  The gate accepts iff |r|^2 <= g.
Cost = A * P(reject | true) + B * P(accept | false), with A = c_miss * P(true), B = c_false * P(false).
The digital twin knows s2 only as its own (too small) odometry-noise value."""
import math, random

__all__ = ["gamma_cdf", "chi2_cdf", "reject_true", "accept_false", "cost", "opt_gate", "opt_gate_k2", "regret",
           "mc_rates", "sigma_gate", "fitted_regret", "gate_inflation_regret"]


def gamma_cdf(kappa, x):
    """Regularised lower incomplete gamma P(kappa, x) (series / continued fraction)."""
    if x <= 0:
        return 0.0
    lg = math.lgamma(kappa)
    if x < kappa + 1:
        s, t, n = 1.0 / kappa, 1.0 / kappa, kappa
        for _ in range(10000):
            n += 1
            t *= x / n
            s += t
            if t < s * 1e-16:
                break
        return s * math.exp(-x + kappa * math.log(x) - lg)
    tiny = 1e-300
    b = x + 1 - kappa
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - kappa)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        de = d * c
        h *= de
        if abs(de - 1) < 1e-16:
            break
    return 1 - math.exp(-x + kappa * math.log(x) - lg) * h


def chi2_cdf(k, x):
    return gamma_cdf(k / 2.0, x / 2.0)


def reject_true(g, s2, k=2):
    """P(a true closure is rejected) at squared gate g when the real residual variance per axis is s2."""
    return 1.0 - chi2_cdf(k, g / s2)


def accept_false(g, s2, tau2, k=2):
    """P(a false closure is accepted); its residual variance per axis is s2 + tau2."""
    return chi2_cdf(k, g / (s2 + tau2))


def cost(g, s2, tau2, A, B, k=2):
    return A * reject_true(g, s2, k) + B * accept_false(g, s2, tau2, k)


def opt_gate_k2(s2, tau2, A, B):
    """Exact optimum for k=2: stationarity (A/s2) e^{-g/2s2} = (B/v) e^{-g/2v}, v = s2+tau2."""
    v = s2 + tau2
    arg = A * v / (B * s2)
    return 0.0 if arg <= 1 else 2 * s2 * v / tau2 * math.log(arg)


def opt_gate(s2, tau2, A, B, k=2):
    """Numerical optimum (log-grid + golden section) for any k."""
    f = lambda lg: cost(math.exp(lg), s2, tau2, A, B, k)
    grid = [math.log(s2) - 6 + 0.05 * i for i in range(int(14 / 0.05))]
    i = min(range(len(grid)), key=lambda j: f(grid[j]))
    a, b = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
    r = (math.sqrt(5) - 1) / 2
    c, d = b - r * (b - a), a + r * (b - a)
    for _ in range(80):
        if f(c) < f(d):
            b = d
        else:
            a = c
        c, d = b - r * (b - a), a + r * (b - a)
    return math.exp((a + b) / 2)


def regret(g, s2, tau2, A, B, k=2):
    """Excess real cost of gate g over the real-optimal gate."""
    return cost(g, s2, tau2, A, B, k) - cost(opt_gate(s2, tau2, A, B, k), s2, tau2, A, B, k)


def mc_rates(g, s2, tau2, k, n, seed):
    """Monte Carlo (P(reject|true), P(accept|false))."""
    rng = random.Random(seed)
    rt = ra = 0
    sd_t, sd_f = math.sqrt(s2), math.sqrt(s2 + tau2)
    for _ in range(n):
        if sum(rng.gauss(0, sd_t) ** 2 for _ in range(k)) > g:
            rt += 1
        if sum(rng.gauss(0, sd_f) ** 2 for _ in range(k)) <= g:
            ra += 1
    return rt / n, ra / n


def sigma_gate(g, s2):
    """Gate radius in units of the real noise standard deviation."""
    return math.sqrt(g / s2)


def _gamma_weights(kappa, m=4000, span=(0.0, None)):
    """Quadrature nodes/weights for x ~ Gamma(kappa, mean 1) (trapezoid on a fine grid of the density)."""
    sd = kappa ** -0.5
    lo = max(1e-3, 1 - 9 * sd) if kappa > 20 else 1e-3
    hi = 1 + 12 * sd + 8.0 / kappa
    xs = [lo + (hi - lo) * (i + 0.5) / m for i in range(m)]
    lg = math.lgamma(kappa)
    ws = [math.exp(kappa * math.log(kappa) + (kappa - 1) * math.log(x) - kappa * x - lg) for x in xs]
    z = sum(ws)
    return xs, [w / z for w in ws]


def fitted_regret(n, s2, tau2, A, B, k=2):
    """Expected real regret when the twin's variance is re-fitted from n real true-closure residuals:
    s2_hat = s2 * chi2_{nk}/(nk), gate = real-cost-optimal for s2_hat (exact k=2 formula, numeric otherwise)."""
    xs, ws = _gamma_weights(n * k / 2.0)
    c0 = cost(opt_gate(s2, tau2, A, B, k), s2, tau2, A, B, k)
    tot = 0.0
    for x, w in zip(xs, ws):
        sh = s2 * x
        g = opt_gate_k2(sh, tau2, A, B) if k == 2 else opt_gate(sh, tau2, A, B, k)
        tot += w * (cost(g, s2, tau2, A, B, k) - c0)
    return tot


def gate_inflation_regret(c, s2_twin, s2_real, tau2, A, B, k=2):
    """Regret of the gate optimal for an inflated twin variance c*s2_twin, evaluated in the real system."""
    g = opt_gate(c * s2_twin, tau2, A, B, k)
    return regret(g, s2_real, tau2, A, B, k)
