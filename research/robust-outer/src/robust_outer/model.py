"""DiLoCo-style local SGD with a robust outer aggregator (companion to noisy-local-sgd, which averaged).

Mode j has curvature a_j. A worker runs H inner steps of size eta with noise sigma^2 and returns the displacement
d = s x - n, s = 1 - q^H, q = 1 - eta a, n ~ N(0, Vw), Vw = eta^2 sigma^2 (1 - q^{2H}) / (1 - q^2).
The server forms, per mode, A({d_i}) with an aggregator that is translation-equivariant (A(d + c) = A(d) + c: mean,
median, trimmed mean) and applies x' = x - alpha A. Then A = s x + B with B independent of x, so the dynamics is
x' = (1 - alpha s) x - alpha B exactly, and with B = sqrt(Vw) b (b the standardised aggregator error, mean m, variance v):
    E x = -sqrt(Vw) m / s,   Var x = alpha Vw v / (s (2 - alpha s)),
    loss = sum_j (a_j/2) [ alpha Vw_j v / (s_j (2 - alpha s_j)) + Vw_j m^2 / s_j^2 ].
Uncorrupted mean: m = 0, v = 1/N (noisy-local-sgd). Attackers (f of N) send s x + Delta sqrt(Vw); for order-statistic
aggregators the worst case is Delta -> +infinity, which places them at the top ranks, so B is a mean of honest order
statistics of m = N - f standard normals over the aggregator's rank set R (median: middle rank(s); t-trimmed mean:
ranks t+1 .. N-t; it is finite iff max R <= N - f).
"""
import math
import random

__all__ = ["curvature", "worker_noise", "ranks_mean", "ranks_median", "ranks_trimmed", "order_moments", "bias_var",
           "var_mc", "bias_only", "alpha_max", "floor_parts", "floor", "efficiency", "median_bias_asymptotic", "breakeven_delta",
           "best_trim", "simulate", "sim_floor", "simulate_literal"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def ranks_mean(N):
    return list(range(1, N + 1))


def ranks_median(N):
    return [(N + 1) // 2] if N % 2 else [N // 2, N // 2 + 1]


def ranks_trimmed(N, t):
    """Drop the t smallest and t largest, average the rest (t = 0: mean; t = (N-1)//2: median)."""
    if not 0 <= t <= (N - 1) // 2:
        raise ValueError("trim")
    return list(range(t + 1, N - t + 1))


def _phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def _Phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


_cache = {}


def order_moments(m, r, lo=-9.0, hi=9.0, n=3600):
    """(E X, E X^2) for the r-th smallest of m iid standard normals, by Simpson quadrature of the order-statistic density."""
    key = (m, r)
    if key in _cache:
        return _cache[key]
    lc = math.lgamma(m + 1) - math.lgamma(r) - math.lgamma(m - r + 1)
    h = (hi - lo) / n
    m1 = m2 = 0.0
    for i in range(n + 1):
        x = lo + i * h
        P = _Phi(x)
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        if P <= 0.0 or P >= 1.0:
            continue
        f = math.exp(lc + (r - 1) * math.log(P) + (m - r) * math.log1p(-P)) * _phi(x)
        m1 += w * f * x
        m2 += w * f * x * x
    _cache[key] = (m1 * h / 3, m2 * h / 3)
    return _cache[key]


def bias_var(N, f, ranks, delta=math.inf, mc=200000, seed=0):
    """Standardised aggregator error b of the rank-average over `ranks` of N inputs when f are attackers.
    Mean aggregator (ranks = all): attackers at +delta (finite delta allowed): m = f delta / N, v = (N - f) / N^2 exactly.
    Otherwise attackers at +infinity: m exact by quadrature; v exact for a single rank, else Monte Carlo (mc draws)."""
    if len(ranks) == N:
        return (f * delta / N if f else 0.0), (N - f) / (N * N)
    m_h = N - f
    if max(ranks) > m_h:
        return math.inf, math.inf
    mean = sum(order_moments(m_h, r)[0] for r in ranks) / len(ranks)
    if len(ranks) == 1:
        e1, e2 = order_moments(m_h, ranks[0])
        return e1, e2 - e1 * e1
    return mean, var_mc(m_h, ranks, mc, seed)


def bias_only(N, f, ranks):
    """Worst-case (attackers at +infinity) standardised bias of an order-statistic aggregator; no variance needed."""
    if max(ranks) > N - f:
        return math.inf
    return sum(order_moments(N - f, r)[0] for r in ranks) / len(ranks)


def var_mc(m, ranks, draws, seed=0):
    rng = random.Random(seed)
    lo, hi = min(ranks) - 1, max(ranks)
    k = len(ranks)
    s1 = s2 = 0.0
    for _ in range(draws):
        xs = sorted(rng.gauss(0, 1) for _ in range(m))
        y = sum(xs[lo:hi]) / k
        s1 += y
        s2 += y * y
    return s2 / draws - (s1 / draws) ** 2


def alpha_max(s):
    """Stability limit of the outer step; unchanged by the aggregator because B is independent of x."""
    return 2.0 / s


def floor_parts(a_list, eta, sigma, N, H, alpha, m, v):
    """(variance loss, bias loss) given aggregator error mean m and variance v (standardised)."""
    var_l = bias_l = 0.0
    for a in a_list:
        s = curvature(eta, a, H)
        Vw = worker_noise(eta, a, sigma, H)
        if alpha * s >= 2:
            return math.inf, math.inf
        var_l += 0.5 * a * alpha * Vw * v / (s * (2 - alpha * s))
        bias_l += 0.5 * a * Vw * m * m / (s * s)
    return var_l, bias_l


def floor(a_list, eta, sigma, N, H, alpha, m, v):
    return sum(floor_parts(a_list, eta, sigma, N, H, alpha, m, v))


def efficiency(N, ranks, mc=200000, seed=0):
    """N * Var(b) with no attackers: 1 for the mean, -> pi/2 for the median."""
    _, v = bias_var(N, 0, ranks, mc=mc, seed=seed)
    return N * v


def median_bias_asymptotic(eps):
    """Large-N bias of the median in honest-noise sigmas when a fraction eps of workers push one way: Phi(z) = 1/(2(1-eps))."""
    p = 1.0 / (2.0 * (1.0 - eps))
    lo, hi = 0.0, 10.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if _Phi(mid) < p else (lo, mid)
    return 0.5 * (lo + hi)


def breakeven_delta(N, f, ranks, **kw):
    """Attack offset (in honest-noise sigmas) above which the aggregator has smaller bias than the mean (f delta / N)."""
    m, _ = bias_var(N, f, ranks, **kw)
    return m * N / f


def best_trim(a_list, eta, sigma, N, f, H, alpha, mc=100000, seed=0):
    """Trim level t >= f that minimises the worst-case (delta = infinity) loss, with the full table of (t, var, bias)."""
    rows = []
    for t in range(f, (N - 1) // 2 + 1):
        m, v = bias_var(N, f, ranks_trimmed(N, t), mc=mc, seed=seed)
        vl, bl = floor_parts(a_list, eta, sigma, N, H, alpha, m, v)
        rows.append((t, vl, bl))
    return min(rows, key=lambda r: r[1] + r[2]), rows


def _agg(kind, d):
    n = len(d)
    if kind == "mean":
        return sum(d) / n
    srt = sorted(d)
    if kind == "median":
        return srt[n // 2] if n % 2 else 0.5 * (srt[n // 2 - 1] + srt[n // 2])
    t = int(kind[4:])                                   # "trim<t>"
    return sum(srt[t:n - t]) / (n - 2 * t)


def simulate(kind, s_list, Vw_list, alpha, N, f, delta, rounds, burn, seed=0):
    """Literal simulation of the outer loop: honest workers send s x - n, the f attackers send s x + delta sqrt(Vw) (they know x),
    the server applies `kind` per mode. Returns (E x_j, E x_j^2) per mode."""
    rng = random.Random(seed)
    D = len(s_list)
    sd = [math.sqrt(v) for v in Vw_list]
    x = [0.0] * D
    a1, a2, cnt = [0.0] * D, [0.0] * D, 0
    for t in range(rounds):
        for j in range(D):
            d = [s_list[j] * x[j] - rng.gauss(0, sd[j]) for _ in range(N - f)] + [s_list[j] * x[j] + delta * sd[j]] * f
            x[j] -= alpha * _agg(kind, d)
        if t >= burn:
            for j in range(D):
                a1[j] += x[j]
                a2[j] += x[j] * x[j]
            cnt += 1
    return [a / cnt for a in a1], [a / cnt for a in a2]


def sim_floor(kind, a_list, eta, sigma, N, f, delta, H, alpha, rounds, burn, seed=0):
    s = [curvature(eta, a, H) for a in a_list]
    Vw = [worker_noise(eta, a, sigma, H) for a in a_list]
    _, m2 = simulate(kind, s, Vw, alpha, N, f, delta, rounds, burn, seed)
    return sum(0.5 * a * x for a, x in zip(a_list, m2))


def simulate_literal(kind, a_list, eta, sigma, N, f, delta, H, alpha, rounds, burn, seed=0):
    """As `simulate` but each honest worker runs the H noisy gradient steps itself (checks the (s, Vw) reduction). Returns E x_j^2."""
    rng = random.Random(seed)
    D = len(a_list)
    s = [curvature(eta, a, H) for a in a_list]
    sd = [math.sqrt(worker_noise(eta, a, sigma, H)) for a in a_list]
    x = [0.0] * D
    acc, cnt = [0.0] * D, 0
    for t in range(rounds):
        for j in range(D):
            d = []
            for _ in range(N - f):
                y = x[j]
                for _ in range(H):
                    y -= eta * (a_list[j] * y + rng.gauss(0, sigma))
                d.append(x[j] - y)
            d += [s[j] * x[j] + delta * sd[j]] * f
            x[j] -= alpha * _agg(kind, d)
        if t >= burn:
            for j in range(D):
                acc[j] += x[j] * x[j]
            cnt += 1
    return [a / cnt for a in acc]
