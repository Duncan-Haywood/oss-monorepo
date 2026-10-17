"""Scalar plant x+ = a x + b u + w (w ~ N(0, s2)), cost E[x^2 + r u^2], measured with an integer delay d (controller sees x_{t-d}).
A twin that omits latency gives d_hat = 0; a delay-aware twin uses a Smith-style predictor built for d_hat. Everything is exact
(Lyapunov equation on the stacked delay state) except where marked."""
import math
import random

__all__ = ["dare", "lqr_gain", "smith_cost", "closed_loop", "spectral_radius", "cost", "static_gain_stable_range",
           "delay_margin", "best_static_gain", "id_samples", "id_error_mc", "id_error_gauss"]


def dare(a, b, r, q=1.0):
    p = q
    for _ in range(100000):
        p2 = q + a * a * p - (a * b * p) ** 2 / (r + b * b * p)
        if abs(p2 - p) < 1e-15 * max(1.0, p):
            return p2
        p = p2
    return p


def lqr_gain(a, b, r):
    p = dare(a, b, r)
    return a * b * p / (r + b * b * p)


def smith_cost(a, b, r, s2, d):
    """Optimal cost with known delay d: s2 [P + (r + b^2 P) K^2 sum_{j<d} a^{2j}] (certainty equivalence with a d-step predictor)."""
    p = dare(a, b, r)
    k = a * b * p / (r + b * b * p)
    return s2 * (p + (r + b * b * p) * k * k * sum(a ** (2 * j) for j in range(d)))


def _mm(x, y):
    yt = list(zip(*y))
    return [[sum(u * v for u, v in zip(row, col)) for col in yt] for row in x]


def closed_loop(a, b, k, d, dh):
    """Stacked state v = [x_t..x_{t-m}, u_{t-1}..u_{t-m}], m = max(d, dh); controller believes its reading is dh steps old and predicts
    forward with the true (a, b) and its own past inputs. Returns (F, c) with u_t = c.v and v+ = F v + e0 w."""
    m = max(d, dh)
    n = 2 * m + 1
    c = [0.0] * n
    c[d] -= k * a ** dh
    for j in range(dh):
        c[m + (dh - j)] -= k * a ** (dh - 1 - j) * b
    f = [[0.0] * n for _ in range(n)]
    for i in range(n):
        f[0][i] = b * c[i]
    f[0][0] += a
    for i in range(1, m + 1):
        f[i][i - 1] = 1.0
    if m >= 1:
        f[m + 1] = list(c)
        for j in range(2, m + 1):
            f[m + j][m + j - 1] = 1.0
    return f, c


def spectral_radius(f, doublings=12):
    g = [row[:] for row in f]
    logs = 0.0
    for _ in range(doublings):
        g = _mm(g, g)
        s = max(abs(x) for row in g for x in row)
        if s == 0:
            return 0.0
        g = [[x / s for x in row] for row in g]
        logs = 2 * logs + math.log(s)
    return math.exp(logs / 2 ** doublings)


def cost(a, b, r, s2, k, d, dh=0):
    """Stationary cost E[x^2 + r u^2] of the closed loop, or inf if unstable."""
    f, c = closed_loop(a, b, k, d, dh)
    if spectral_radius(f) >= 1 - 1e-9:
        return math.inf
    n = len(f)
    p = [[0.0] * n for _ in range(n)]
    p[0][0] = s2
    g = [row[:] for row in f]
    for _ in range(60):
        gt = [list(col) for col in zip(*g)]
        add = _mm(_mm(g, p), gt)
        p = [[x + y for x, y in zip(r1, r2)] for r1, r2 in zip(p, add)]
        g = _mm(g, g)
    cu = sum(c[i] * sum(p[i][j] * c[j] for j in range(n)) for i in range(n))
    return p[0][0] + r * cu


def static_gain_stable_range(a, b, d):
    """Exact stable interval of the gain k in u = -k x_{t-d} for a > 1: lower edge (a-1)/b (root at z=1); upper edge from the unit-circle
    crossing e^{i d w}(e^{i w} - a) = -b k, smallest sqrt(1 + a^2 - 2 a cos w)/b over solutions of d w + arg(e^{iw} - a) = pi (mod 2 pi),
    or (1+a)/b when d = 0 (root at -1). Returns (lo, hi) or None when empty."""
    lo = (a - 1) / b
    if d == 0:
        return lo, (1 + a) / b
    g = lambda w: d * w + math.atan2(math.sin(w), math.cos(w) - a)
    best = math.inf
    grid = 20000
    for target in [math.pi * (2 * j + 1) for j in range(0, d + 1)]:
        prev_w, prev = 1e-9, g(1e-9) - target
        for i in range(1, grid + 1):
            w = math.pi * i / grid
            cur = g(w) - target
            if prev * cur < 0:
                x0, x1 = prev_w, w
                for _ in range(80):
                    xm = (x0 + x1) / 2
                    if (g(xm) - target) * (g(x0) - target) <= 0:
                        x1 = xm
                    else:
                        x0 = xm
                wc = (x0 + x1) / 2
                best = min(best, math.sqrt(1 + a * a - 2 * a * math.cos(wc)) / b)
            prev_w, prev = w, cur
    if best == math.inf:  # no crossing away from w = 0: the boundary is tangent at z = 1 and the interval is empty
        return None
    hi = min(best, (1 + a) / b if d % 2 == 0 else math.inf)
    return (lo, hi) if hi > lo + 1e-9 else None


def delay_margin(a, b, k, dmax=200):
    """Largest measurement delay the static gain k tolerates (-1 if unstable even at d = 0)."""
    last = -1
    for d in range(dmax + 1):
        rng = static_gain_stable_range(a, b, d)
        if rng is None or not (rng[0] < k < rng[1]):
            break
        last = d
    return last


def best_static_gain(a, b, r, s2, d, pts=60):
    """Best static gain on x_{t-d} by grid then golden-section inside the exact stable interval."""
    rng = static_gain_stable_range(a, b, d)
    if rng is None:
        return None, math.inf
    lo, hi = rng
    f = lambda k: cost(a, b, r, s2, k, d)
    ks = [lo + (hi - lo) * (i + 0.5) / pts for i in range(pts)]
    j = min(range(pts), key=lambda i: f(ks[i]))
    x0, x1 = ks[max(j - 1, 0)], ks[min(j + 1, pts - 1)]
    gr = (math.sqrt(5) - 1) / 2
    c1, c2 = x1 - gr * (x1 - x0), x0 + gr * (x1 - x0)
    for _ in range(60):
        if f(c1) < f(c2):
            x1 = c2
        else:
            x0 = c1
        c1, c2 = x1 - gr * (x1 - x0), x0 + gr * (x1 - x0)
    k = (x0 + x1) / 2
    return k, f(k)


def _z(alpha):
    lo, hi = 0.0, 10.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if 0.5 * math.erfc(mid / math.sqrt(2)) > alpha:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def id_samples(snr, alpha):
    """Gaussian approximation to the samples needed so a least-squares delay choice confuses two adjacent lags with prob <= alpha:
    n = z^2 * 2 (1 + 1/snr), snr = b^2 su^2 / s2 (i.i.d. probe u of variance su^2, known a, b)."""
    return _z(alpha) ** 2 * 2 * (1 + 1 / snr)


def id_error_gauss(snr, n):
    return 0.5 * math.erfc(math.sqrt(n / (2 * (1 + 1 / snr))) / math.sqrt(2))


def id_error_mc(snr, n, rng, runs=4000, b=1.0):
    """Monte Carlo prob that squared-error fit prefers lag 1 over the true lag 0 (residual y+ - a y = b u_{t-delay} + w)."""
    su = math.sqrt(snr) / b
    bad = 0
    for _ in range(runs):
        e = 0.0
        for _ in range(n):
            u0, u1, w = rng.gauss(0, su), rng.gauss(0, su), rng.gauss(0, 1)
            e += (b * (u0 - u1) + w) ** 2 - w ** 2
        bad += e < 0
    return bad / runs
