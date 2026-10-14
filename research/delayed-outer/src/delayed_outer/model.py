"""DiLoCo-style local SGD whose outer update is applied tau rounds late (communication overlapped with compute).

Mode with curvature a: a worker started from a model runs H inner steps of size eta with gradient noise sigma^2 and returns
q^H x + n, q = 1 - eta a, Var n = Vw; outer curvature s = 1 - q^H. Averaging N workers, the displacement is s x - n with
Var n = Vw / N. Workers start from the model they last received, which is tau rounds old:
    x_{t+1} = x_t - alpha (s x_{t-tau} - n_t) = x_t - c x_{t-tau} + e_t,   c = alpha s,  Var e = alpha^2 Vw / N.
Characteristic polynomial z^(tau+1) - z^tau + c.
    stable  iff  c < c_max(tau) = 2 sin(pi / (2 (2 tau + 1)));
    fastest (double root) at c = tau^tau / (tau+1)^(tau+1), radius tau / (tau + 1);
    stationary Var x from the Yule-Walker system (closed form for tau = 0, 1).
"""
import math
import random

__all__ = ["curvature", "worker_noise", "c_max", "alpha_max", "c_fast", "rate_fast", "spectral_radius", "var_delay",
           "var_delay_closed", "floor", "alpha_for_floor", "round_time", "rounds_to_shrink", "simulate_floor"]


def curvature(eta, a, H):
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def c_max(tau):
    return 2.0 * math.sin(math.pi / (2.0 * (2 * tau + 1)))


def alpha_max(s, tau):
    return c_max(tau) / s


def c_fast(tau):
    return tau ** tau / (tau + 1.0) ** (tau + 1)


def rate_fast(tau):
    return tau / (tau + 1.0)


def spectral_radius(c, tau, iters=4000):
    """Largest root modulus of z^(tau+1) - z^tau + c (Durand-Kerner)."""
    n = tau + 1
    if n == 1:
        return abs(1 - c)
    coef = [0j] * (n + 1)
    coef[0], coef[1], coef[n] = 1, -1, c
    roots = [(0.4 + 0.9j) ** k for k in range(n)]
    for _ in range(iters):
        delta = 0.0
        for i in range(n):
            p = 0j
            for co in coef:
                p = p * roots[i] + co
            q = 1 + 0j
            for j in range(n):
                if j != i:
                    q *= roots[i] - roots[j]
            d = p / q
            roots[i] -= d
            delta = max(delta, abs(d))
        if delta < 1e-14:
            break
    return max(abs(r) for r in roots)


def var_delay(c, tau, e2=1.0):
    """Stationary Var x of x' = x - c x_{-tau} + e, Var e = e2, via Yule-Walker; inf if unstable."""
    if c >= c_max(tau) or c <= 0:
        return math.inf
    m = tau + 2                                      # unknowns g_0..g_{tau+1}
    A = [[0.0] * m for _ in range(m)]
    b = [0.0] * m
    A[0][0] += 1.0
    A[0][1] -= 1.0
    A[0][tau + 1] += c
    b[0] = e2
    for k in range(1, m):                            # g_k = g_{k-1} - c g_{|k-1-tau|}
        A[k][k] += 1.0
        A[k][k - 1] -= 1.0
        A[k][abs(k - 1 - tau)] += c
    for i in range(m):                               # Gaussian elimination
        p = max(range(i, m), key=lambda r: abs(A[r][i]))
        A[i], A[p] = A[p], A[i]
        b[i], b[p] = b[p], b[i]
        for r in range(i + 1, m):
            f = A[r][i] / A[i][i]
            for k in range(i, m):
                A[r][k] -= f * A[i][k]
            b[r] -= f * b[i]
    g = [0.0] * m
    for i in range(m - 1, -1, -1):
        g[i] = (b[i] - sum(A[i][k] * g[k] for k in range(i + 1, m))) / A[i][i]
    return g[0]


def var_delay_closed(c, tau, e2=1.0):
    if tau == 0:
        return e2 / (c * (2 - c)) if 0 < c < 2 else math.inf
    if tau == 1:
        return e2 * (1 + c) / ((1 - c) * c * (2 + c)) if 0 < c < 1 else math.inf
    raise ValueError("closed form for tau <= 1 only")


def floor(a_list, eta, sigma, N, H, alpha, tau):
    """Stationary excess loss sum (a/2) Var x."""
    tot = 0.0
    for a in a_list:
        s = curvature(eta, a, H)
        v = var_delay(alpha * s, tau, alpha * alpha * worker_noise(eta, a, sigma, H) / N)
        tot += 0.5 * a * v
    return tot


def alpha_for_floor(a_list, eta, sigma, N, H, tau, target):
    """Largest step whose stationary loss is <= target (the floor is increasing in alpha)."""
    s_max = max(curvature(eta, a, H) for a in a_list)
    lo, hi = 0.0, alpha_max(s_max, tau)
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if floor(a_list, eta, sigma, N, H, mid, tau) <= target:
            lo = mid
        else:
            hi = mid
    return lo


def round_time(Tc, L, tau):
    """Wall-clock per round with tau+1 rounds in flight: compute-bound once latency is hidden."""
    return max(Tc, (Tc + L) / (tau + 1))


def rounds_to_shrink(a_list, eta, H, alpha, tau, factor):
    """Rounds for the slowest mode to shrink by `factor`, from its spectral radius."""
    r = max(spectral_radius(alpha * curvature(eta, a, H), tau) for a in a_list)
    return math.inf if r >= 1 else math.log(factor) / -math.log(r)


def simulate_floor(a, eta, sigma, N, H, alpha, tau, rounds, burn, seed=0):
    """Literal delayed-outer DiLoCo on one mode: workers start from the model of tau rounds ago and run H noisy SGD steps."""
    rng = random.Random(seed)
    hist = [1.0] * (tau + 1)                          # x_{t-tau} .. x_t
    acc, n = 0.0, 0
    for t in range(rounds):
        stale = hist[0]
        d = 0.0
        for _ in range(N):
            y = stale
            for _ in range(H):
                y -= eta * (a * y + sigma * rng.gauss(0, 1))
            d += (stale - y) / N
        new = hist[-1] - alpha * d
        hist = hist[1:] + [new]
        if t >= burn:
            acc += new * new
            n += 1
    return 0.5 * a * acc / n
