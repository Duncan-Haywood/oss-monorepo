"""Scalar unstable plant x' = a x + sat_U(u) + w, w ~ N(0, s^2), u = -K x.

'Loss of control' = first time |x| > L, L = U/(a-1) (beyond it even full thrust
cannot pull x back: a x - U > x).  The twin has the same plant with no actuator
limit (u unbounded).  Mean exit time T(x0) from (-L, L) solves
T(x) = 1 + int_{-L}^{L} p(y|x) T(y) dy, discretised by a midpoint (Nystrom)
rule and solved by Gaussian elimination.  Pure Python.
"""
import math, random

__all__ = ["lqr_gain", "sat", "limit", "mean_exit_time", "simulate_exit", "twin_sat_rate",
           "best_gain"]


def lqr_gain(a, b, q, r):
    """Scalar discrete Riccati gain K = abP/(r+b^2 P)."""
    P = q
    for _ in range(20000):
        Pn = q + a * a * P - (a * b * P) ** 2 / (r + b * b * P)
        if abs(Pn - P) < 1e-14 * max(1.0, P):
            P = Pn
            break
        P = Pn
    return a * b * P / (r + b * b * P)


def sat(u, U):
    return max(-U, min(U, u))


def limit(a, U):
    return U / (a - 1.0)


def _solve(A, rhs):
    n = len(A)
    M = [row[:] + [rhs[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda i: abs(M[i][c]))
        M[c], M[p] = M[p], M[c]
        pv = M[c][c]
        for i in range(c + 1, n):
            f = M[i][c] / pv
            if f:
                Mi, Mc = M[i], M[c]
                for j in range(c, n + 1):
                    Mi[j] -= f * Mc[j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def _mean(x, a, b, K, U):
    u = -K * x
    if U is not None:
        u = sat(u, U)
    return a * x + b * u


def mean_exit_time(a, b, K, U_real, s, L, N=240, U_model=None):
    """Mean exit time from (-L,L) starting at 0.

    U_model: actuator limit used in the dynamics (None = linear twin, U_real = real
    plant).  The exit region L is always the real plant's, so twin and real are
    compared on the same failure event."""
    h = 2 * L / N
    xs = [-L + (i + 0.5) * h for i in range(N)]
    Um = U_model
    A = []
    c = h / (s * math.sqrt(2 * math.pi))
    for xi in xs:
        m = _mean(xi, a, b, K, Um)
        row = [-c * math.exp(-0.5 * ((xj - m) / s) ** 2) for xj in xs]
        A.append(row)
    for i in range(N):
        A[i][i] += 1.0
    T = _solve(A, [1.0] * N)
    # linear interpolation at 0 (centre lies between cells N/2-1 and N/2)
    return 0.5 * (T[N // 2 - 1] + T[N // 2])


def simulate_exit(a, b, K, U_model, s, L, rng, cap=10 ** 7):
    x = 0.0
    for t in range(1, cap + 1):
        x = _mean(x, a, b, K, U_model) + s * rng.gauss(0, 1)
        if abs(x) > L:
            return t
    return cap


def twin_sat_rate(a, b, K, s, U):
    """Twin's own warning: P(|K x| > U) under the twin's stationary law."""
    m = a - b * K
    sd = s / math.sqrt(1 - m * m)
    z = U / (K * sd)
    return math.erfc(z / math.sqrt(2))


def best_gain(a, b, s, L, U_model, Ks, U_real=None, N=160):
    """Gain in Ks maximising the mean exit time (grid search)."""
    best = None
    for K in Ks:
        T = mean_exit_time(a, b, K, U_real, s, L, N=N, U_model=U_model)
        if best is None or T > best[1]:
            best = (K, T)
    return best
