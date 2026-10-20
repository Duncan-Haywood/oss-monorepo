"""Plant m x'' + c x' + k x = u(t), parameters theta = (m, c, k), position measured with noise.

Truth m=1, c=0.4, k=4 (natural frequency 2 rad/s, damping ratio 0.1). A trace is T=10 s
sampled every DT=0.02 s with Gaussian noise of std SIGMA. The four candidate inputs are scaled to
the same RMS, so the comparison is at equal input energy.
"""
import math
import random

TRUE = (1.0, 0.4, 4.0)
DT = 0.02
T = 10.0
N = int(round(T / DT))
SIGMA = 0.01
WN = math.sqrt(TRUE[2] / TRUE[0])


def _raw(name):
    if name == "step":
        return lambda t: 1.0
    if name == "resonant sine":
        return lambda t: math.sin(WN * t)
    if name == "off-resonance sine":
        return lambda t: math.sin(3.0 * WN * t)
    if name == "chirp":  # 0.2 to 6 rad/s, linear in time
        w0, w1 = 0.2, 6.0
        return lambda t: math.sin(w0 * t + 0.5 * (w1 - w0) * t * t / T)
    if name == "heldout chirp":  # different sweep, used only for prediction tests
        w0, w1 = 6.0, 0.5
        return lambda t: math.sin(w0 * t + 0.5 * (w1 - w0) * t * t / T)
    raise KeyError(name)


def _rms(f):
    return math.sqrt(sum(f(i * DT) ** 2 for i in range(N)) / N)


def inputs():
    """name -> u(t) with unit RMS over the trace."""
    out = {}
    for n in ("step", "resonant sine", "off-resonance sine", "chirp"):
        f, r = _raw(n), _rms(_raw(n))
        out[n] = (lambda f, r: lambda t: f(t) / r)(f, r)
    return out


def heldout_input():
    f, r = _raw("heldout chirp"), _rms(_raw("heldout chirp"))
    return lambda t: f(t) / r


def simulate(theta, u):
    """Positions at t = DT, 2 DT, ... N DT by RK4 with substeps of DT/2 (zero initial state)."""
    m, c, k = theta
    h = DT / 2.0
    x = v = 0.0
    out = []
    t = 0.0

    def acc(t, x, v):
        return (u(t) - c * v - k * x) / m

    for _ in range(N):
        for _ in range(2):
            a1 = acc(t, x, v)
            x2, v2 = x + 0.5 * h * v, v + 0.5 * h * a1
            a2 = acc(t + 0.5 * h, x2, v2)
            x3, v3 = x + 0.5 * h * v2, v + 0.5 * h * a2
            a3 = acc(t + 0.5 * h, x3, v3)
            x4, v4 = x + h * v3, v + h * a3
            a4 = acc(t + h, x4, v4)
            x += h * (v + 2 * v2 + 2 * v3 + v4) / 6.0
            v += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6.0
            t += h
        out.append(x)
    return out


def jacobian(theta, u):
    """d(output)/d(theta) by central differences, as a list of 3 columns."""
    cols = []
    for j in range(3):
        d = 1e-4 * theta[j]
        hi = list(theta); lo = list(theta)
        hi[j] += d; lo[j] -= d
        a, b = simulate(hi, u), simulate(lo, u)
        cols.append([(p - q) / (2 * d) for p, q in zip(a, b)])
    return cols


def _gram(cols):
    return [[sum(a * b for a, b in zip(ci, cj)) for cj in cols] for ci in cols]


def _solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(i + 1, n):
            f = M[r][i] / M[i][i]
            for c in range(i, n + 1):
                M[r][c] -= f * M[i][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def _inverse(A):
    n = len(A)
    cols = [_solve(A, [1.0 if i == j else 0.0 for i in range(n)]) for j in range(n)]
    return [[cols[j][i] for j in range(n)] for i in range(n)]


def crb_std(u, theta=TRUE):
    """Cramer-Rao standard deviations of (m, c, k) for unbiased estimators, white noise SIGMA."""
    G = _gram(jacobian(theta, u))
    inv = _inverse([[g / SIGMA ** 2 for g in row] for row in G])
    return [math.sqrt(inv[i][i]) for i in range(3)]


def condition_number(u, theta=TRUE):
    """Ratio of the Fisher matrix's extreme eigenvalues after scaling each parameter to its truth value."""
    cols = [[a * theta[j] for a in c] for j, c in enumerate(jacobian(theta, u))]
    G = _gram(cols)
    # eigenvalues of a symmetric 3x3 by Jacobi rotations
    A = [r[:] for r in G]
    for _ in range(60):
        p, q = max(((i, j) for i in range(3) for j in range(i + 1, 3)), key=lambda ij: abs(A[ij[0]][ij[1]]))
        if abs(A[p][q]) < 1e-18:
            break
        th = 0.5 * math.atan2(2 * A[p][q], A[q][q] - A[p][p])
        c, s = math.cos(th), math.sin(th)
        for k in range(3):
            A[k][p], A[k][q] = c * A[k][p] - s * A[k][q], s * A[k][p] + c * A[k][q]
        for k in range(3):
            A[p][k], A[q][k] = c * A[p][k] - s * A[q][k], s * A[p][k] + c * A[q][k]
    ev = sorted(A[i][i] for i in range(3))
    return ev[2] / ev[0]


def fit(y, u, start, iters=12):
    """Gauss-Newton least squares from `start`, with step halving and a positivity guard."""
    th = list(start)
    r = [a - b for a, b in zip(y, simulate(th, u))]
    cost = sum(e * e for e in r)
    for _ in range(iters):
        cols = jacobian(th, u)
        G = _gram(cols)
        g = [sum(a * b for a, b in zip(c, r)) for c in cols]
        step = _solve([[G[i][j] + (1e-9 * G[i][i] if i == j else 0.0) for j in range(3)] for i in range(3)], g)
        lam = 1.0
        while lam > 1e-3:
            cand = [t + lam * s for t, s in zip(th, step)]
            if min(cand) > 0:
                rc = [a - b for a, b in zip(y, simulate(cand, u))]
                cc = sum(e * e for e in rc)
                if cc < cost:
                    th, r, cost = cand, rc, cc
                    break
            lam /= 2
        else:
            break
    return th


def trial_errors(u, trials, seed):
    """Fit `trials` noisy traces; returns the list of fitted thetas."""
    rng = random.Random(seed)
    clean = simulate(TRUE, u)
    fits = []
    for _ in range(trials):
        y = [a + rng.gauss(0, SIGMA) for a in clean]
        start = [t * (1 + rng.uniform(-0.3, 0.3)) for t in TRUE]
        fits.append(fit(y, u, start))
    return fits


def heldout_rmse(theta, u_test):
    """RMS position error of the fitted twin against the truth on an input it was not fitted to."""
    a, b = simulate(theta, u_test), simulate(TRUE, u_test)
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(a, b)) / len(a))
