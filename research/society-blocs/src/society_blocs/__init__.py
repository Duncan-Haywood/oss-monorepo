"""Robots among stubborn blocs on both sides of a walking convention.

Extends society-stubborn (same memory rule, binary passing-side game, well-mixed meetings).
Of the humans, a share sr always walks R (the status quo) and a share sl always walks L (the
robots' side), apart from the usual error eps. The rest are adaptive: they take the majority of
their last M partners' sides. Committed robots (share rho of everyone) always walk L.
Question: what robot share tips the adaptive people, and when does the crowd tip with no robots?

Stdlib only. Stylised: no geometry, one binary decision per meeting.
"""
import math
import random

L, R = 1, 0


def binom_tail(m, q, k):
    """P(Bin(m, q) >= k)."""
    return sum(math.comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(k, m + 1))


def partner_l_prob(x, rho, sl, sr, eps):
    """Chance a random partner walks L when a share x of adaptive humans' rules say L.

    Robots (rho) walk L; stubborn-L humans (share sl of humans) walk L, stubborn-R humans (sr)
    walk R, each erring with probability eps; adaptive humans follow their rule w.p. 1 - eps.
    """
    adaptive = x * (1 - eps) + eps / 2
    human = (1 - sl - sr) * adaptive + sl * (1 - eps / 2) + sr * eps / 2
    return rho + (1 - rho) * human


def mean_field_map(x, rho, sl, sr, m, eps):
    return binom_tail(m, partner_l_prob(x, rho, sl, sr, eps), (m + 1) // 2)


def low_fixed_point(rho, sl, sr, m, eps, tol=1e-12):
    """Fixed point of the map reached from x = 0 (the status-quo basin)."""
    x = 0.0
    for _ in range(100000):
        nx = mean_field_map(x, rho, sl, sr, m, eps)
        if abs(nx - x) < tol:
            return nx
        x = nx
    return x


def critical_share(sl, sr, m, eps, tol=1e-6):
    """Least robot share whose status-quo basin passes x = 1/2.

    0.0 if the crowd already tips with no robots; nan if even rho = 1 cannot tip it.
    """
    if low_fixed_point(0.0, sl, sr, m, eps) >= 0.5:
        return 0.0
    if low_fixed_point(1.0, sl, sr, m, eps) < 0.5:
        return float("nan")
    lo, hi = 0.0, 1.0
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if low_fixed_point(mid, sl, sr, m, eps) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def critical_sl(sr, m, eps, tol=1e-6):
    """Least stubborn-L share at which a crowd with no robots tips by itself (nan if none)."""
    if low_fixed_point(0.0, 1 - sr, sr, m, eps) < 0.5:
        return float("nan")
    lo, hi = 0.0, 1.0 - sr
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if low_fixed_point(0.0, mid, sr, m, eps) >= 0.5:
            hi = mid
        else:
            lo = mid
    return hi


def simulate(n=200, rho=0.2, sl=0.0, sr=0.0, m=9, eps=0.02, rounds=500, seed=0):
    """One well-mixed population with committed robots. Returns the final share of adaptive
    humans whose memory majority is L, and the conflict rate per human meeting.

    Each round holds n/2 meetings. Robots and stubborn humans never update.
    """
    rng = random.Random(seed)
    nr = round(rho * n)
    humans = list(range(nr, n))
    nl, nrr = round(sl * len(humans)), round(sr * len(humans))
    fixed = [None] * n
    for i in range(nr):
        fixed[i] = L
    for i in humans[:nl]:
        fixed[i] = L
    for i in humans[nl:nl + nrr]:
        fixed[i] = R
    adaptive = [i for i in humans if fixed[i] is None]
    mem = [[R] * m for _ in range(n)]
    ptr = [0] * n
    cnt = [0] * n
    half = m // 2

    def choose(i):
        if i >= nr and rng.random() < eps:
            return L if rng.random() < 0.5 else R
        if fixed[i] is not None:
            return fixed[i]
        return L if cnt[i] > half else R

    def remember(i, side):
        if fixed[i] is not None:
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
