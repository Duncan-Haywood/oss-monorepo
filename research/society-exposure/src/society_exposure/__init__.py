"""Robots as a committed minority when stubborn people convert after meeting robots.

Extends society-converts (same memory rule, binary passing-side game, well-mixed meetings).
A share s of humans start *stubborn* (always walk R). A stubborn person converts into an
ordinary memory-rule person (memory all R, never turns back) after it has met a committed
robot `k` times. k = None never converts (society-stubborn). `c` > 0 adds society-converts'
exposure-blind conversion, per round, so the two can be compared at a matched average rate.
Committed robots (share rho of everyone) walk L.

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import random

L, R = 1, 0


def matched_c(rho, k):
    """Per-round conversion probability with the same mean time to convert as exposure threshold k.

    Each person is in about one meeting per round (n/2 meetings of two) and the partner is a
    robot with probability rho, so k robot meetings take about k / rho rounds.
    """
    return rho / k


def simulate(n=200, rho=0.2, s=0.4, m=9, eps=0.02, k=None, c=0.0, rounds=1000, seed=0):
    """One well-mixed population with committed robots.

    Returns the first round when at least half of non-robot humans have a majority-L memory
    (None if never within `rounds`), the final share of non-robot humans on L, and the final
    share still stubborn.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    humans = list(range(nr, n))
    stubborn = set(humans[:round(s * len(humans))])
    exposure = {i: 0 for i in stubborn}
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

    def meet_robot(i):
        """Stubborn i just met a robot: count it, convert at k."""
        if k is not None and i in stubborn:
            exposure[i] += 1
            if exposure[i] >= k:
                stubborn.discard(i)

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
            if j < nr:
                meet_robot(i)
            if i < nr:
                meet_robot(j)
            remember(i, sj)
            remember(j, si)
        if tip is None and sum(cnt[i] > half for i in humans) / len(humans) >= 0.5:
            tip = t
    return {"tip_round": tip,
            "final_share_l": sum(cnt[i] > half for i in humans) / len(humans),
            "final_stubborn": len(stubborn) / len(humans)}
