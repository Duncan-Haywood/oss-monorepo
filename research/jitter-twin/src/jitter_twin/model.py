"""Scalar loop x[n+1] = x[n] - k x[n-d_n] + w[n] with random measurement delay d_n (i.i.d., or a Markov chain on the delay values).

State s = (x[n], ..., x[n-D]), D = max delay; s[n+1] = A_{d_n} s[n] + b w[n]. Pure Python.
"""
import math
import random


def delay_matrices(k, delays):
    D = max(delays)
    n = D + 1
    mats = []
    for d in delays:
        A = [[0.0] * n for _ in range(n)]
        A[0][0] += 1.0
        A[0][d] -= k
        for i in range(1, n):
            A[i][i - 1] = 1.0
        mats.append(A)
    return mats


def mm(A, B):
    return [[sum(A[i][l] * B[l][j] for l in range(len(B))) for j in range(len(B[0]))] for i in range(len(A))]


def tr(A):
    return [list(r) for r in zip(*A)]


def const_critical_gain(d):
    """Largest k with x[n+1] = x[n] - k x[n-d] stable (constant delay d): 2 sin(pi / (2(2d+1)))."""
    return 2.0 * math.sin(math.pi / (2.0 * (2 * d + 1)))


def effective_delay(kc):
    """Constant (possibly fractional) delay whose critical gain is kc."""
    return (math.pi / (2.0 * math.asin(kc / 2.0)) - 1.0) / 2.0


def sticky(probs, rho):
    """Transition matrix with stationary law `probs` and persistence rho in [0,1): stay w.p. rho,
    otherwise redraw from `probs`. rho = 0 is i.i.d.; the marginal law of the delay is the same for every rho."""
    m = len(probs)
    return [[(1 - rho) * probs[j] + (rho if i == j else 0.0) for j in range(m)] for i in range(m)]


def _push(mats, P, Q):
    """Mode-wise second moments: Q'_j = sum_i P[i][j] A_i Q_i A_i^T."""
    m = len(mats)
    n = len(mats[0])
    T = [mm(mm(mats[i], Q[i]), tr(mats[i])) for i in range(m)]
    return [[[sum(P[i][j] * T[i][a][b] for i in range(m)) for b in range(n)] for a in range(n)] for j in range(m)]


def _trace(Q):
    return sum(Q[j][i][i] for j in range(len(Q)) for i in range(len(Q[j])))


def ms_rho(k, delays, probs, rho=0.0, iters=1500):
    """Growth rate per step of the total second moment E|s|^2 (spectral radius of the second-moment operator,
    by power iteration); mean-square stable iff < 1. rho = delay persistence (0 = i.i.d.)."""
    mats = delay_matrices(k, delays)
    P = sticky(probs, rho)
    n = len(mats[0])
    Q = [[[probs[j] if a == b else 0.0 for b in range(n)] for a in range(n)] for j in range(len(mats))]
    logsum = 0.0
    cnt = 0
    for it in range(iters):
        Q = _push(mats, P, Q)
        t = _trace(Q)
        if t == 0.0:
            return 0.0
        if t > 1e100:
            return float("inf")
        Q = [[[v / t for v in r] for r in M] for M in Q]
        if it >= iters // 2:
            logsum += math.log(t)
            cnt += 1
    return math.exp(logsum / cnt)


def ms_critical_gain(delays, probs, rho=0.0, kmax=2.5, iters=1500, steps=30):
    """Mean-square critical gain by bisection on ms_rho = 1 (assumes stability is monotone in k on (0, kmax);
    the tests check that on a grid)."""
    lo, hi = 0.0, kmax
    if ms_rho(hi, delays, probs, rho, iters) < 1.0:
        return float("inf")
    for _ in range(steps):
        mid = 0.5 * (lo + hi)
        if ms_rho(mid, delays, probs, rho, iters) >= 1.0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def lyapunov(k, delays, probs, rho=0.0, n=100000, seed=1):
    """Almost-sure growth exponent per step of |s| (simulation, renormalised)."""
    rng = random.Random(seed)
    mats = delay_matrices(k, delays)
    m = len(mats[0])
    P = sticky(probs, rho)

    def draw(row):
        u = rng.random()
        acc = 0.0
        for j, p in enumerate(row):
            acc += p
            if u <= acc:
                return j
        return len(row) - 1

    mode = draw(probs)
    s = [1.0] + [0.0] * (m - 1)
    tot = 0.0
    for _ in range(n):
        A = mats[mode]
        s = [sum(A[i][l] * s[l] for l in range(m)) for i in range(m)]
        nr = math.sqrt(sum(v * v for v in s))
        tot += math.log(nr)
        s = [v / nr for v in s]
        mode = draw(P[mode])
    return tot / n


def as_critical_gain(delays, probs, rho=0.0, kmax=2.5, n=60000, steps=22, seed=1):
    """Gain at which the simulated a.s. exponent crosses 0 (bisection; Monte-Carlo, fixed seed)."""
    lo, hi = 0.0, kmax
    for _ in range(steps):
        mid = 0.5 * (lo + hi)
        if lyapunov(mid, delays, probs, rho, n, seed) >= 0.0:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def stationary_var(k, delays, probs, rho=0.0, sigma=1.0, iters=100000, tol=1e-12):
    """Stationary Var(x) under N(0, sigma^2) process noise (fixed point of the mode-wise Lyapunov recursion);
    inf if it does not converge (mean-square unstable)."""
    mats = delay_matrices(k, delays)
    P = sticky(probs, rho)
    n = len(mats[0])
    Q = [[[0.0] * n for _ in range(n)] for _ in mats]
    for _ in range(iters):
        T = _push(mats, P, Q)
        for j, p in enumerate(probs):
            T[j][0][0] += p * sigma * sigma
        v = sum(T[j][0][0] for j in range(len(T)))
        diff = max(abs(T[j][a][b] - Q[j][a][b]) for j in range(len(T)) for a in range(n) for b in range(n))
        Q = T
        if v > 1e12:
            return float("inf")
        if diff < tol * max(1.0, v):
            return v
    return float("inf")
