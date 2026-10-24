"""Robots as a committed minority in a crowd that includes stubborn people.

Extends society-robotnorms (same memory rule, same binary passing-side game, well-mixed
meetings). A share s of the humans are *stubborn*: they always walk R, the status-quo side,
whatever their partners do (apart from the usual error eps). The remaining humans remember
the sides of their last M partners and take the majority. Committed robots (share rho of
everyone) always walk L. Question: how does the tipping share of robots depend on s?

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import math
import random

L, R = 1, 0


def binom_tail(m, q, k):
    """P(Bin(m, q) >= k)."""
    return sum(math.comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(k, m + 1))


def partner_l_prob(x, rho, s, eps):
    """Chance a random partner walks L when a share x of adaptive humans' rules say L.

    Robots (rho) walk L; stubborn humans (share s of humans) walk R but err with
    probability eps; adaptive humans follow their rule with probability 1 - eps.
    """
    adaptive = x * (1 - eps) + eps / 2
    return rho + (1 - rho) * ((1 - s) * adaptive + s * eps / 2)


def mean_field_map(x, rho, s, m, eps):
    return binom_tail(m, partner_l_prob(x, rho, s, eps), (m + 1) // 2)


def low_fixed_point(rho, s, m, eps, tol=1e-12):
    """Fixed point of the map reached from x = 0 (the status-quo basin)."""
    x = 0.0
    for _ in range(100000):
        nx = mean_field_map(x, rho, s, m, eps)
        if abs(nx - x) < tol:
            return nx
        x = nx
    return x


def critical_share(s, m, eps, lo=0.0, hi=1.0, tol=1e-6):
    """Least robot share whose status-quo basin passes x = 1/2; nan if even rho = hi cannot."""
    if low_fixed_point(hi, s, m, eps) < 0.5:
        return float("nan")
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if low_fixed_point(mid, s, m, eps) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def simulate(n=200, rho=0.2, s=0.0, m=9, eps=0.02, rounds=500, robots="committed", seed=0):
    """One well-mixed population. Returns final share of adaptive humans on L and conflict rates.

    robots='committed' (always L) or 'adaptive' (run the human rule). Each round holds n/2 meetings.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    robot = set(range(nr))
    humans = list(range(nr, n))
    ns = round(s * len(humans))
    stubborn = set(humans[:ns])
    committed = robots == "committed"
    adaptive = [i for i in humans if i not in stubborn]
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2
    fixed = lambda i: (committed and i in robot) or i in stubborn  # noqa: E731

    def choose(i):
        if committed and i in robot:
            return L
        if rng.random() < eps:
            return L if rng.random() < 0.5 else R
        if i in stubborn:
            return R
        return L if cnt[i] > half else R

    def remember(i, side):
        if fixed(i):
            return
        old = mem[i][ptr[i]]
        mem[i][ptr[i]] = side
        cnt[i] += side - old
        ptr[i] = (ptr[i] + 1) % m

    hconf = hmeet = 0
    for _ in range(rounds):
        for _ in range(n // 2):
            i = rng.randrange(n)
            j = rng.randrange(n - 1)
            j += j >= i
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
            hum = (i >= nr) + (j >= nr)
            hmeet += hum
            if si != sj:
                hconf += hum
    final = sum(cnt[i] > half for i in adaptive) / len(adaptive) if adaptive else 0.0
    return {"final_share_l": final, "human_conflict_rate": hconf / hmeet if hmeet else 0.0}
