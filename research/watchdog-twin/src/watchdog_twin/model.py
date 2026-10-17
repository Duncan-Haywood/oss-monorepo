"""Heartbeat watchdog on a lossy link: i.i.d. twin vs two-state (Gilbert) real channel.

Real link: hidden state G/B; the heartbeat of a tick is lost iff the state is B. Transitions G->B with prob a, B->G with
prob b = 1/L (L = mean burst length). Mean loss p = a/(a+b), so a = p*b/(1-p). The twin drops each heartbeat
independently with probability p. The watchdog trips (e-stop) after m consecutive losses; with the link statistically
unchanged this is a false trip. Time is measured in ticks (heartbeat periods).
"""
import math
import random
from fractions import Fraction


def gilbert_params(p, L):
    """(a, b) of the Gilbert chain with mean loss p and mean loss-burst length L. Requires a <= 1."""
    b = 1.0 / L
    a = p * b / (1.0 - p)
    if not (0.0 < p < 1.0 and L >= 1.0 and a <= 1.0):
        raise ValueError("infeasible (p, L)")
    return a, b


def iid_L(p):
    """Burst length at which the Gilbert chain is exactly i.i.d. (a + b = 1)."""
    return 1.0 / (1.0 - p)


def twin_mtt(p, m):
    """Exact mean ticks until the first run of m losses with i.i.d. losses: (1 - p^m) / ((1 - p) p^m)."""
    return (1.0 - p ** m) / ((1.0 - p) * p ** m)


def real_mtt(p, L, m):
    """Exact mean ticks until m consecutive losses on the Gilbert link, started from the stationary distribution.

    F_G, F_k = expected additional ticks after a good tick / after k consecutive losses (F_m = 0):
        F_G = 1 + (1-a) F_G + a F_1,   F_k = 1 + b F_G + (1-b) F_{k+1}.
    Back-substituting F_k = alpha_k + beta_k F_G from k = m-1 down to 1 leaves one scalar equation. Done in exact rational
    arithmetic: the unknowns are as large as 1e13 and a float elimination loses digits to cancellation.
    """
    a, b = gilbert_params(p, L)
    if m == 1:
        return 1.0 / p
    a, b = Fraction(a), Fraction(b)
    alpha, beta = Fraction(0), Fraction(0)  # F_m = 0
    for _ in range(m - 1):  # k = m-1 .. 1
        alpha, beta = 1 + (1 - b) * alpha, b + (1 - b) * beta
    if beta == 1:  # b = 1: losses never last two ticks, so a run of m >= 2 never happens
        return math.inf
    # F_G = 1 + (1-a) F_G + a (alpha + beta F_G)  =>  a F_G (1 - beta) = 1 + a alpha
    FG = (1 + a * alpha) / (a * (1 - beta))
    F1 = alpha + beta * FG
    return float(1 + (1 - Fraction(p)) * FG + Fraction(p) * F1)


def real_rate_approx(p, L, m):
    """Large-m trip rate per tick: a burst starts after a good tick at rate p*b and survives m-1 more ticks w.p. (1-b)^(m-1)."""
    b = 1.0 / L
    return p * b * (1.0 - b) ** (m - 1)


def twin_rate_approx(p, m):
    return (1.0 - p) * p ** m


def min_m(mtt_fn, target):
    """Smallest m whose mean time to false trip is at least `target` ticks."""
    m = 1
    while mtt_fn(m) < target:
        m += 1
        if m > 100000:
            raise RuntimeError("no m found")
    return m


def m_real_approx(p, L, target):
    """Continuous large-m solution of rate = 1/target: m = 1 + ln(target*p*b)/ln(1/(1-b))."""
    b = 1.0 / L
    return 1.0 + math.log(target * p * b) / math.log(1.0 / (1.0 - b))


def m_twin_approx(p, target):
    return math.log(target * (1.0 - p)) / math.log(1.0 / p)


def no_trip_prob(p, L, m, N):
    """Exact P(no run of m losses in N ticks) on the Gilbert link (stationary start), by forward DP over (state, run)."""
    a, b = gilbert_params(p, L)
    g = 1 - p
    # prob mass: G, and B with run k=1..m-1
    G = g
    B = [0.0] * m
    if m > 1:
        B[1] = p
    for _ in range(N - 1):
        nG = G * (1 - a) + sum(B[1:m]) * b
        nB = [0.0] * m
        if m > 1:
            nB[1] = G * a
        for k in range(1, m - 1):
            nB[k + 1] += B[k] * (1 - b)
        G, B = nG, nB
    return G + sum(B[1:m])


def simulate_first_trip(p, L, m, rng, cap=10 ** 7):
    """One run of the Gilbert link; ticks to the first run of m losses."""
    a, b = gilbert_params(p, L)
    bad = rng.random() < p
    run = 0
    t = 0
    while t < cap:
        t += 1
        if bad:
            run += 1
            if run >= m:
                return t
        else:
            run = 0
        bad = (rng.random() >= b) if bad else (rng.random() < a)
    return cap


def simulate_first_trip_iid(p, m, rng, cap=10 ** 7):
    run = 0
    for t in range(1, cap + 1):
        if rng.random() < p:
            run += 1
            if run >= m:
                return t
        else:
            run = 0
    return cap
