"""Sparsified outer synchronisation in DiLoCo-style local SGD, with and without error feedback.

One quadratic mode (curvature s after H inner steps, worker end-point noise variance V, N workers); the mode is one
coordinate of the pseudo-gradient, and each worker transmits that coordinate in a round with probability p (independent
rand-k / Bernoulli sparsification: p = k/d). Worker i's pseudo-gradient is g_i = s x + n_i, Var n_i = V.

Unbiased (rescaled) sparsification:  server step x' = x - alpha (1/N) sum_i (b_i/p) g_i.
    E(1 - alpha s (1/N) sum b_i/p)^2 = 1 - 2 alpha s + alpha^2 s^2 (1 + w/N), w = 1/p - 1, so
    Var x = alpha V (1+w) / (N s (2 - alpha s (1+w/N))), stable iff alpha s (1+w/N) < 2.

Error feedback: worker i keeps memory e_i, sends C_i = b_i P_i with P_i = e_i + g_i, stores e_i' = P_i - C_i, and the
server steps x' = x - alpha (1/N) sum_i C_i. Second moments X = E x^2, M = E x e_i, Q = E e_i^2, R = E e_i e_j (i != j)
close on a 4-dimensional linear recursion (see `_ef_matrix`), solved exactly for the stationary point.
The virtual iterate y = x - alpha mean(e) follows uncompressed SGD driven by gradients taken at x.
"""
import math
import random

__all__ = ["curvature", "worker_noise", "mean_rate", "fastest_rate", "critical_alpha_s", "loss_spectrum", "loss_after", "floor_unbiased", "alpha_max_unbiased", "ef_moments", "floor_ef", "floor_ef_closed", "alpha_max_ef", "ef_recursion",
           "floor_full", "simulate"]


def curvature(eta, a, H):
    """Outer curvature s = 1 - (1 - eta a)^H of a mode with inner curvature a after H local steps."""
    return 1.0 - (1.0 - eta * a) ** H


def worker_noise(eta, a, sigma, H):
    """V: variance of one worker's end-point noise in that mode (exact)."""
    q = 1.0 - eta * a
    return eta * eta * sigma * sigma * (1 - q ** (2 * H)) / (1 - q * q)


def mean_rate(alpha_s, p):
    """Per-round contraction (spectral radius) of the mean of (x, e) under error feedback: roots of
    lam^2 - (1 - alpha s p + q) lam + q = 0, q = 1 - p. det = q for every alpha."""
    q = 1 - p
    tr = 1 - alpha_s * p + q
    disc = tr * tr / 4 - q
    if disc >= 0:
        r = math.sqrt(disc)
        return max(abs(tr / 2 + r), abs(tr / 2 - r))
    return math.sqrt(q)


def fastest_rate(p):
    """sqrt(1-p): the fastest mean contraction error feedback can reach, for any alpha s in the critical band."""
    return math.sqrt(1 - p)


def critical_alpha_s(p):
    """Band of alpha s in which the rate is exactly sqrt(1-p): ((1-sqrt q)^2/p, (1+sqrt q)^2/p)."""
    r = math.sqrt(1 - p)
    return (1 - r) ** 2 / p, (1 + r) ** 2 / p


def loss_spectrum(rule, a_list, eta, sigma, H, alpha, N, p):
    """Stationary excess loss sum_j (a_j/2) Var x_j: every coordinate is masked independently and modes decouple,
    so the total is the sum of the one-mode floors (rand-k with p = k/d has the same marginals)."""
    fl = floor_ef if rule == "ef" else floor_unbiased
    tot = 0.0
    for a in a_list:
        v = fl(curvature(eta, a, H), worker_noise(eta, a, sigma, H), alpha, N, p)
        tot += 0.5 * a * v
    return tot


def loss_after(rule, a_list, eta, sigma, H, alpha, N, p, T, x0=1.0):
    """Exact expected excess loss sum_j (a_j/2) E x_j^2 after T rounds from x_j = x0, e = 0 (transient plus floor)."""
    tot = 0.0
    for a in a_list:
        s, V = curvature(eta, a, H), worker_noise(eta, a, sigma, H)
        if rule == "ef":
            v = [x0 * x0, 0.0, 0.0, 0.0]
            for _ in range(T):
                v = ef_recursion(v, s, V, alpha, N, p)
            X = v[0]
        else:
            w = 1.0 / p - 1.0
            rho = 1 - 2 * alpha * s + alpha * alpha * s * s * (1 + w / N)
            X = x0 * x0
            for _ in range(T):
                X = rho * X + alpha * alpha * (1 + w) * V / N
        tot += 0.5 * a * X
    return tot


def floor_full(s, V, alpha, N):
    """Uncompressed (p = 1): Var x = alpha V / (N s (2 - alpha s))."""
    return alpha * V / (N * s * (2 - alpha * s))


def floor_unbiased(s, V, alpha, N, p):
    w = 1.0 / p - 1.0
    d = 2 - alpha * s * (1 + w / N)
    return math.inf if d <= 0 else alpha * V * (1 + w) / (N * s * d)


def alpha_max_unbiased(s, N, p):
    return 2.0 / (s * (1 + (1.0 / p - 1.0) / N))


def _ef_matrix(s, V, alpha, N, p):
    """Return (T, c): moments v = (X, M, Q, R) obey v' = T v + c V."""
    # A = E P_i^2 = Q + 2 s M + s^2 X + V ; B = E P_i x = M + s X ; Cc = E P_i P_j = R + 2 s M + s^2 X
    # X' = X - 2 alpha p B + (alpha^2/N) (p A + (N-1) p^2 Cc)
    # M' = (1-p) B - (alpha/N)(N-1) p (1-p) Cc
    # Q' = (1-p) A ;  R' = (1-p)^2 Cc
    q = 1 - p
    A = [s * s, 2 * s, 1.0, 0.0]          # coefficients on (X, M, Q, R); constant V separate
    B = [s, 1.0, 0.0, 0.0]
    C = [s * s, 2 * s, 0.0, 1.0]
    k = alpha * alpha / N
    T = [[0.0] * 4 for _ in range(4)]
    c = [0.0] * 4
    for j in range(4):
        T[0][j] = (1.0 if j == 0 else 0.0) - 2 * alpha * p * B[j] + k * (p * A[j] + (N - 1) * p * p * C[j])
        T[1][j] = q * B[j] - (alpha / N) * (N - 1) * p * q * C[j]
        T[2][j] = q * A[j]
        T[3][j] = q * q * C[j]
    c[0] = k * p
    c[2] = q
    return T, c


def ef_recursion(v, s, V, alpha, N, p):
    """One exact step of the moment recursion."""
    T, c = _ef_matrix(s, V, alpha, N, p)
    return [sum(T[i][j] * v[j] for j in range(4)) + c[i] * V for i in range(4)]


def _solve(Mx, b):
    n = len(b)
    a = [row[:] + [b[i]] for i, row in enumerate(Mx)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(a[r][i]))
        a[i], a[piv] = a[piv], a[i]
        for r in range(n):
            if r != i:
                f = a[r][i] / a[i][i]
                a[r] = [x - f * y for x, y in zip(a[r], a[i])]
    return [a[i][n] / a[i][i] for i in range(n)]


def _spectral_radius(T, squarings=60):
    """Spectral radius by repeated squaring with renormalisation (robust to complex / negative dominant eigenvalues)."""
    P = [row[:] for row in T]
    logn = 0.0
    for k in range(squarings):
        nrm = max(abs(x) for row in P for x in row)
        if nrm == 0:
            return 0.0
        P = [[x / nrm for x in row] for row in P]
        logn = 2 * logn + math.log(nrm)
        P = [[sum(P[i][m] * P[m][j] for m in range(4)) for j in range(4)] for i in range(4)]
    nrm = max(abs(x) for row in P for x in row)
    logn = 2 * logn + math.log(nrm) if nrm > 0 else -math.inf
    return math.exp(logn / 2 ** (squarings + 1))


def ef_moments(s, V, alpha, N, p):
    """Stationary (X, M, Q, R); None if the second-moment recursion is not contractive."""
    T, c = _ef_matrix(s, V, alpha, N, p)
    if _spectral_radius(T) >= 1.0:
        return None
    Mx = [[(1.0 if i == j else 0.0) - T[i][j] for j in range(4)] for i in range(4)]
    return _solve(Mx, [ci * V for ci in c])


def _ef_denominator(s, alpha, N, p):
    q, g = 1 - p, alpha * (N - 1) / N
    K = (2 - p) / (p * (p * (2 - p) + 2 * s * g * q))
    return 2 * s * (1 / p - g * q * s * K) - (alpha * s * s / N) * ((2 * q * (1 / p - g * s * K) + 1) / p + (N - 1) * p * K)


def floor_ef_closed(s, V, alpha, N, p):
    """Closed form of the error-feedback floor: Var x = alpha V / (N p D), D from _ef_denominator (inf if D <= 0)."""
    D = _ef_denominator(s, alpha, N, p)
    return math.inf if D <= 0 else alpha * V / (N * p * D)


def floor_ef(s, V, alpha, N, p):
    m = ef_moments(s, V, alpha, N, p)
    return math.inf if m is None else m[0]


def alpha_max_ef(s, N, p, tol=1e-9):
    """Largest alpha with a contractive second-moment recursion (bisection on the spectral radius)."""
    lo, hi = 0.0, 16.0 / s
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        T, _ = _ef_matrix(s, 1.0, mid, N, p)
        if _spectral_radius(T) < 1.0:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return lo


def simulate(mode, s, V, alpha, N, p, rounds, burn, seed=0):
    """Literal simulation: draw each worker's noise and its Bernoulli mask; returns E x^2 after burn-in.
    mode: 'unbiased' (rescale by 1/p) or 'ef' (error feedback)."""
    rng = random.Random(seed)
    sd = math.sqrt(V)
    x, e = 0.0, [0.0] * N
    acc, cnt = 0.0, 0
    for t in range(rounds):
        tot = 0.0
        for i in range(N):
            g = s * x + rng.gauss(0, sd)
            b = rng.random() < p
            if mode == "unbiased":
                if b:
                    tot += g / p
            else:
                P = e[i] + g
                if b:
                    tot += P
                    e[i] = 0.0
                else:
                    e[i] = P
        x -= alpha * tot / N
        if t >= burn:
            acc += x * x
            cnt += 1
    return acc / cnt
