"""Fit the stubborn-bloc walking-side model to a measured side preference.

The model is that of society-blocs (same memory rule, well-mixed binary passing-side game):
of the humans a share sl always walks L (the robots' side), a share sr always walks R (the status
quo), each erring with probability eps; the rest take the majority of their last M partners.
Committed robots (share rho of everyone) walk L.

Here the crowd starts in the status-quo convention (R) with no robots, and the observable is the
share of L choices in a head-on meeting, `observed_l_share`. Given a measured value, sl and eps
trade off, and `fit_sl` solves for sl at each eps. Stdlib only.
"""
import math
import random

L, R = 1, 0


def binom_tail(m, q, k):
    """P(Bin(m, q) >= k)."""
    return sum(math.comb(m, j) * q ** j * (1 - q) ** (m - j) for j in range(k, m + 1))


def partner_l_prob(x, rho, sl, sr, eps):
    """Chance a random partner walks L when a share x of adaptive humans' rules say L."""
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


def observed_l_share(sl, sr, m, eps, rho=0.0):
    """Share of L choices in a meeting, in the status-quo state (x = low fixed point)."""
    return partner_l_prob(low_fixed_point(rho, sl, sr, m, eps), rho, sl, sr, eps)


def critical_share(sl, sr, m, eps, tol=1e-6):
    """Least robot share whose status-quo basin passes x = 1/2 (0.0 if none needed, nan if none works)."""
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


def fit_sl(ell, sr, m, eps, tol=1e-9):
    """The sl at which the status-quo crowd shows an L share of ell in meetings.

    None if no sl in [0, 1 - sr] gives it while the crowd is still in the status-quo basin
    (adaptive majority R): eps alone already shows more than ell, or sl would have to be so large
    that the crowd tips by itself.
    """
    def stays_sq(sl):
        return low_fixed_point(0.0, sl, sr, m, eps) < 0.5

    if observed_l_share(0.0, sr, m, eps) > ell:
        return None
    hi = 1.0 - sr
    lo = 0.0
    if stays_sq(hi):
        top = hi
    else:
        a, b = 0.0, hi            # largest sl that still stays in the status-quo basin
        for _ in range(60):
            mid = (a + b) / 2
            if stays_sq(mid):
                a = mid
            else:
                b = mid
        top = a
    if observed_l_share(top, sr, m, eps) < ell:
        return None
    hi = top
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if observed_l_share(mid, sr, m, eps) >= ell:
            hi = mid
        else:
            lo = mid
    return hi


def simulate(n=200, rho=0.0, sl=0.0, sr=0.0, m=9, eps=0.02, rounds=500, seed=0):
    """One well-mixed population, as society-blocs. Returns the final share of adaptive humans
    whose memory majority is L, and the share of L choices by humans over the last 100 rounds."""
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

    hl = hn = 0
    for r in range(rounds):
        for _ in range(n // 2):
            i = rng.randrange(n)
            j = rng.randrange(n - 1)
            j += j >= i
            si, sj = choose(i), choose(j)
            remember(i, sj)
            remember(j, si)
            if r >= rounds - 100:
                for k, s in ((i, si), (j, sj)):
                    if k >= nr:
                        hl += s
                        hn += 1
    final = sum(cnt[i] > half for i in adaptive) / len(adaptive) if adaptive else 0.0
    return {"final_share_l": final, "human_l_share": hl / hn if hn else 0.0}
