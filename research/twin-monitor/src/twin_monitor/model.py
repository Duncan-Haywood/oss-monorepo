"""Anytime-valid monitoring of a digital twin in the scalar LQ plant x' = a x + b u + w, w ~ N(0, s2).

The twin (ah, bh) predicts x' ~ N(ah x + bh u, s2). Deployed policy u = -k x + e, e ~ N(0, v) (v = dither).
Residual r = x' - ah x - bh u = -(da x + db u) + w, da = ah - a, db = bh - b. Regressor z = (x, u).
Mixture e-process: theta ~ N(0, tau2 I) over the mean shift r = theta.z + w; log E_n = 1/2 m' A^-1 m - 1/2 ln det(I + tau2 G/s2),
G = sum z z', m = sum z r / s2, A = G/s2 + I/tau2. Under the twin being exact E_n is a test martingale (Ville).
"""
import math, random

__all__ = ["cost", "riccati_p", "optimal_gain", "regret", "closed_loop", "moments", "kl_rate", "rate_coeffs",
           "dither_cost_per_v", "dither_cost", "blind_twin", "log_e", "expected_log_e", "predicted_delay",
           "simple_delay", "run_monitor", "run_peeking", "monitoring_cost", "optimal_dither_blind",
           "optimal_dither", "CHI2_2_95"]

CHI2_2_95 = 5.991464547107979  # chi-square(2) 95% quantile = -2 ln 0.05


def closed_loop(a, b, k):
    return a - b * k


def cost(a, b, k, q=1.0, r=0.1, s2=1.0, v=0.0):
    """Average cost of u = -k x + e, Var e = v: (q + r k^2)(s2 + b^2 v)/(1 - c^2) + r v; infinite if |c| >= 1."""
    c = closed_loop(a, b, k)
    if abs(c) >= 1:
        return math.inf
    return (q + r * k * k) * (s2 + b * b * v) / (1 - c * c) + r * v


def riccati_p(a, b, q=1.0, r=0.1):
    B = r * (1 - a * a) - q * b * b
    return (-B + math.sqrt(B * B + 4 * b * b * q * r)) / (2 * b * b)


def optimal_gain(a, b, q=1.0, r=0.1):
    p = riccati_p(a, b, q, r)
    return a * b * p / (r + b * b * p)


def regret(a, b, k, q=1.0, r=0.1, s2=1.0):
    return cost(a, b, k, q, r, s2) - cost(a, b, optimal_gain(a, b, q, r), q, r, s2)


def moments(a, b, k, v, s2=1.0):
    """Stationary (E x^2, E u^2, E x u) under u = -k x + e."""
    c = a - b * k
    vx = (s2 + b * b * v) / (1 - c * c)
    return vx, k * k * vx + v, -k * vx


def rate_coeffs(a, b, k, da, db, s2=1.0):
    """The per-step KL rate is alpha0 + beta v with alpha0 = (da-k db)^2 s2/((1-c^2) 2 s2), beta = [(da-k db)^2 b^2/(1-c^2) + db^2]/(2 s2)."""
    c = a - b * k
    g = (da - k * db) ** 2
    return g * s2 / ((1 - c * c) * 2 * s2), (g * b * b / (1 - c * c) + db * db) / (2 * s2)


def kl_rate(a, b, k, da, db, v, s2=1.0):
    """Expected per-step log-likelihood-ratio drift of the true residual law against the twin's: [(da-k db)^2 E x^2 + db^2 v]/(2 s2)."""
    a0, b0 = rate_coeffs(a, b, k, da, db, s2)
    return a0 + b0 * v


def dither_cost_per_v(a, b, k, q=1.0, r=0.1):
    """Extra cost per step of dither variance v is exactly this constant times v."""
    c = a - b * k
    return (q + r * k * k) * b * b / (1 - c * c) + r


def dither_cost(a, b, k, v, q=1.0, r=0.1):
    return dither_cost_per_v(a, b, k, q, r) * v


def blind_twin(a, b, ah, q=1.0, r=0.1):
    """For twin state gain ah, the twin input gain bh whose own trained gain k*(ah,bh) satisfies ah - a = k*(ah, bh)(bh - b)
    (undetectable in closed loop without dither). Returns (bh, k) by bisection in bh above b when ah>a; None if none in range."""
    f = lambda bh: (ah - a) - optimal_gain(ah, bh, q, r) * (bh - b)
    lo, hi = 0.05 * b, 20 * b
    grid = [lo + (hi - lo) * i / 4000 for i in range(4001)]
    for x0, x1 in zip(grid, grid[1:]):
        if f(x0) * f(x1) <= 0 and x0 != b:
            for _ in range(100):
                m = (x0 + x1) / 2
                if f(x0) * f(m) <= 0:
                    x1 = m
                else:
                    x0 = m
            bh = (x0 + x1) / 2
            if abs(bh - b) > 1e-6:
                return bh, optimal_gain(ah, bh, q, r)
    return None


def _inv2(m00, m01, m11):
    d = m00 * m11 - m01 * m01
    return m11 / d, -m01 / d, m00 / d


def log_e(G, s, s2, tau2, noise=False):
    """Log mixture e-value from G = (g00, g01, g11) and s = (s0, s1) = sum z r. noise=True adds the expected noise part
    tr(A^-1 G/s2)/2 of the quadratic form (used by the deterministic equivalent)."""
    g00, g01, g11 = G
    a00, a01, a11 = g00 / s2 + 1 / tau2, g01 / s2, g11 / s2 + 1 / tau2
    i00, i01, i11 = _inv2(a00, a01, a11)
    m0, m1 = s[0] / s2, s[1] / s2
    quad = i00 * m0 * m0 + 2 * i01 * m0 * m1 + i11 * m1 * m1
    det = (1 + tau2 * g00 / s2) * (1 + tau2 * g11 / s2) - (tau2 * g01 / s2) ** 2
    if noise:
        quad += (i00 * g00 + 2 * i01 * g01 + i11 * g11) / s2
    return 0.5 * quad - 0.5 * math.log(det)


def expected_log_e(n, a, b, k, da, db, v, s2, tau2):
    """Deterministic equivalent of log E_n under the true plant: G -> n Sigma_z, s -> n Sigma_z theta with theta = -(da, db)."""
    exx, euu, exu = moments(a, b, k, v, s2)
    G = (n * exx, n * exu, n * euu)
    th = (-da, -db)  # E[z r] = -Sigma (da, db); the sign does not change the quadratic form
    s = (G[0] * th[0] + G[1] * th[1], G[1] * th[0] + G[2] * th[1])
    return log_e(G, s, s2, tau2, noise=True)


def predicted_delay(alpha, a, b, k, da, db, v, s2=1.0, tau2=1.0, nmax=10 ** 7):
    """Smallest n with the deterministic-equivalent log E_n >= ln(1/alpha); inf if never (blind direction, v = 0)."""
    target = math.log(1 / alpha)
    if kl_rate(a, b, k, da, db, v, s2) <= 0:
        return math.inf
    lo, hi = 1.0, 2.0
    while expected_log_e(hi, a, b, k, da, db, v, s2, tau2) < target:
        hi *= 2
        if hi > nmax:
            return math.inf
    for _ in range(80):
        mid = (lo + hi) / 2
        if expected_log_e(mid, a, b, k, da, db, v, s2, tau2) < target:
            lo = mid
        else:
            hi = mid
    return hi


def simple_delay(alpha, a, b, k, da, db, v, s2=1.0):
    """Leading-order delay ln(1/alpha) / KL rate."""
    rate = kl_rate(a, b, k, da, db, v, s2)
    return math.inf if rate <= 0 else math.log(1 / alpha) / rate


def run_monitor(a, b, ah, bh, k, v, alpha, T, s2, tau2, seed, burn=50):
    """Simulate the plant (a, b) under u = -k x + e monitored against the twin (ah, bh); return first n with E_n >= 1/alpha, else None."""
    rng = random.Random(seed)
    sd, sv = math.sqrt(s2), math.sqrt(v)
    thr = math.log(1 / alpha)
    x = 0.0
    g00 = g01 = g11 = s0 = s1 = 0.0
    for t in range(T + burn):
        u = -k * x + (rng.gauss(0, sv) if v > 0 else 0.0)
        xn = a * x + b * u + rng.gauss(0, sd)
        if t >= burn:
            r = xn - ah * x - bh * u
            g00 += x * x
            g01 += x * u
            g11 += u * u
            s0 += x * r
            s1 += u * r
            n = t - burn + 1
            if n >= 2 and log_e((g00, g01, g11), (s0, s1), s2, tau2) >= thr:
                return n
        x = xn
    return None


def run_peeking(a, b, ah, bh, k, v, T, s2, seed, burn=50, n0=10, crit=CHI2_2_95):
    """Naive baseline: refit the two-parameter residual regression after every step and alarm when the chi-square(2) score
    s' G^-1 s / s2 first exceeds its fixed-sample 5% critical value (checked from n0)."""
    rng = random.Random(seed)
    sd, sv = math.sqrt(s2), math.sqrt(v)
    x = 0.0
    g00 = g01 = g11 = s0 = s1 = 0.0
    for t in range(T + burn):
        u = -k * x + (rng.gauss(0, sv) if v > 0 else 0.0)
        xn = a * x + b * u + rng.gauss(0, sd)
        if t >= burn:
            r = xn - ah * x - bh * u
            g00 += x * x
            g01 += x * u
            g11 += u * u
            s0 += x * r
            s1 += u * r
            n = t - burn + 1
            d = g00 * g11 - g01 * g01
            if n >= n0 and d > 1e-12:
                i00, i01, i11 = g11 / d, -g01 / d, g00 / d
                if (i00 * s0 * s0 + 2 * i01 * s0 * s1 + i11 * s1 * s1) / s2 >= crit:
                    return n
        x = xn
    return None


def monitoring_cost(v, a, b, k, da, db, prior_bad, horizon, alpha, q=1.0, r=0.1, s2=1.0, tau2=None):
    """Expected extra cost over a horizon H of a monitoring design with dither v: (1-pi) H c_d v if the twin is good (dither paid for the
    whole horizon), pi (R + c_d v) min(L/rate(v), H) if bad (regret R and dither paid until the alarm, capped at H), L = ln(1/alpha).
    Leading-order delay L/rate, or the deterministic-equivalent mixture delay when tau2 is given. v = 0 is 'monitor passively'."""
    cd = dither_cost_per_v(a, b, k, q, r)
    R = regret(a, b, k, q, r, s2)
    L = math.log(1 / alpha)
    rate = kl_rate(a, b, k, da, db, v, s2)
    if rate <= 0:
        D = horizon
    elif tau2 is None:
        D = min(L / rate, horizon)
    else:
        D = min(predicted_delay(alpha, a, b, k, da, db, v, s2, tau2), horizon)
    return (1 - prior_bad) * horizon * cd * v + prior_bad * (R + cd * v) * D


def optimal_dither_blind(a, b, k, db, prior_bad, horizon, alpha, q=1.0, r=0.1, s2=1.0):
    """Interior stationary point on the blind line da = k db (alpha0 = 0, rate = rho v, rho = db^2/(2 s2)) when the delay cap is slack:
    v* = sqrt(pi L R / (rho (1-pi) H c_d)). Worth using only if it beats v = 0 (see optimal_dither)."""
    cd = dither_cost_per_v(a, b, k, q, r)
    R = regret(a, b, k, q, r, s2)
    L = math.log(1 / alpha)
    rho = db * db / (2 * s2)
    return math.sqrt(prior_bad * L * R / (rho * (1 - prior_bad) * horizon * cd))


def optimal_dither(a, b, k, da, db, prior_bad, horizon, alpha, q=1.0, r=0.1, s2=1.0, vmax=50.0, tau2=None, ngrid=2000):
    """Minimiser of monitoring_cost over v in [0, vmax]: log-grid scan (plus v = 0) refined by golden section. Returns (v, cost)."""
    f = lambda v: monitoring_cost(v, a, b, k, da, db, prior_bad, horizon, alpha, q, r, s2, tau2)
    grid = [math.exp(math.log(1e-6) + (math.log(vmax) - math.log(1e-6)) * i / ngrid) for i in range(ngrid + 1)]
    vals = [f(v) for v in grid]
    j = min(range(len(grid)), key=lambda i: vals[i])
    if f(0.0) <= vals[j]:
        return 0.0, f(0.0)
    lo, hi = math.log(grid[max(j - 1, 0)]), math.log(grid[min(j + 1, ngrid)])
    phi = (math.sqrt(5) - 1) / 2
    for _ in range(100):
        x1, x2 = hi - phi * (hi - lo), lo + phi * (hi - lo)
        if f(math.exp(x1)) < f(math.exp(x2)):
            hi = x2
        else:
            lo = x1
    v = math.exp((lo + hi) / 2)
    return v, f(v)
