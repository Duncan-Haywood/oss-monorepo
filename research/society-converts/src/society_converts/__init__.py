"""Robots as a committed minority when stubborn people slowly convert.

Extends society-stubborn (same memory rule, binary passing-side game, well-mixed meetings).
A share s of humans start *stubborn* (always walk R). Each round every stubborn person
converts with probability c into an ordinary memory-rule person whose memory is all R, and
never turns back. c = 0 reproduces society-stubborn. Committed robots (share rho of everyone)
walk L. Question: below society-stubborn's tipping share the crowd never tips; above it,
how much later does it tip as c falls, and is there a robot share that tips only because
stubborn people leak away?

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import math
import random

L, R = 1, 0


def binom_tail(m, q, k):
    """P(Bin(m, q) >= k)."""
    return sum(math.comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(k, m + 1))


def step(x, st, rho, m, eps, c):
    """One mean-field round. x: share of memory-rule humans whose rule says L;
    st: share of humans still stubborn. Returns (x', st').

    Converts arrive with memory all R, so they enter at rule 'R' (x contribution 0).
    """
    adaptive_share = 1 - st
    adaptive = x * (1 - eps) + eps / 2
    q = rho + (1 - rho) * (adaptive_share * adaptive + st * eps / 2)
    fx = binom_tail(m, q, (m + 1) // 2)
    conv = st * c
    # converts join the memory-rule group with rule R; memory then refills at one slot per meeting
    # (a mean-field approximation: converts adopt the group's map immediately after joining).
    new_adaptive = adaptive_share + conv
    nx = (adaptive_share * fx) / new_adaptive if new_adaptive > 0 else 0.0
    return nx, st - conv


def mean_field_tip_round(rho, s, m, eps, c, rounds=2000):
    """First round at which at least half of all non-robot humans have rule L, or None.

    The mean-field map is applied as a one-step relaxation, so rounds are a time scale, not a
    count of meetings; compare with simulation through rank order, not absolute values.
    """
    x, st = 0.0, s
    for t in range(1, rounds + 1):
        x, st = step(x, st, rho, m, eps, c)
        if x * (1 - st) >= 0.5:
            return t
    return None


def simulate(n=200, rho=0.2, s=0.3, m=9, eps=0.02, c=0.0, rounds=500, seed=0):
    """One well-mixed population with committed robots.

    Returns the first round when at least half of non-robot humans have a majority-L memory
    (None if never within `rounds`), the final share of non-robot humans on L, and the final
    share still stubborn. Each round holds n/2 meetings.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    humans = list(range(nr, n))
    ns = round(s * len(humans))
    stubborn = set(humans[:ns])
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2

    def choose(i):
        if i < nr:
            return L
        if rng.random() < eps:
            return L if rng.random() < 0.5 else R
        if i in stubborn:
            return R
        return L if cnt[i] > half else R

    def remember(i, side):
        if i < nr or i in stubborn:
            return
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = side
        cnt[i] += side - old
        ptr[i] = (ptr[i] + 1) % m

    tip = None
    for t in range(1, rounds + 1):
        if c > 0 and stubborn:
            for i in [i for i in stubborn if rng.random() < c]:
                stubborn.discard(i)
        for _ in range(n // 2):
            i = rng.randrange(n)
            j = rng.randrange(n - 1)
            j += j >= i
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
        if tip is None and sum(cnt[i] > half for i in humans) / len(humans) >= 0.5:
            tip = t
    return {"tip_round": tip,
            "final_share_l": sum(cnt[i] > half for i in humans) / len(humans),
            "final_stubborn": len(stubborn) / len(humans)}
