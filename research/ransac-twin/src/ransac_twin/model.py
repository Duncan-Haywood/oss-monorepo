"""RANSAC iteration budget: fixed-inlier-fraction twin vs scene-to-scene variation.

N correspondences, n_in of them inliers; one iteration draws a minimal sample of s distinct points and
succeeds iff all are inliers, probability q(n_in) = C(n_in, s) / C(N, s).  After K independent iterations the
scene fails with probability (1 - q)^K.
Twin: n_in = round(m N) in every scene.  Real: n_in ~ BetaBinomial(N, a, b) with mean m N and
concentration kappa = a + b (kappa -> infinity recovers the twin).
"""
import math
import random


def comb_ratio(n_in, N, s):
    if n_in < s:
        return 0.0
    r = 1.0
    for i in range(s):
        r *= (n_in - i) / (N - i)
    return r


def budget(q, p):
    """Smallest K with (1-q)^K <= 1-p."""
    if q <= 0:
        return math.inf
    if q >= 1:
        return 1
    return max(1, math.ceil(math.log(1 - p) / math.log(1 - q)))


def lbeta(a, b):
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def betabinom_pmf(N, a, b):
    return [math.exp(math.lgamma(N + 1) - math.lgamma(k + 1) - math.lgamma(N - k + 1)
                     + lbeta(k + a, N - k + b) - lbeta(a, b)) for k in range(N + 1)]


def real_pmf(N, m, kappa):
    return betabinom_pmf(N, m * kappa, (1 - m) * kappa)


def failure(K, N, s, pmf):
    return sum(w * (1 - comb_ratio(k, N, s)) ** K for k, w in enumerate(pmf))


def twin_failure(K, N, s, m):
    return (1 - comb_ratio(round(m * N), N, s)) ** K


def real_budget(N, s, pmf, p):
    """Smallest K with failure <= 1-p (None if not reached by 10**7)."""
    lo, hi = 1, 1
    while failure(hi, N, s, pmf) > 1 - p:
        hi *= 2
        if hi > 10 ** 7:
            return None
    while lo < hi:
        mid = (lo + hi) // 2
        if failure(mid, N, s, pmf) <= 1 - p:
            hi = mid
        else:
            lo = mid + 1
    return lo


def sample_scene(N, pmf, rng):
    u, c = rng.random(), 0.0
    for k, w in enumerate(pmf):
        c += w
        if u <= c:
            return k
    return N


def sampled_failure(K, N, s, n_in, rng):
    """One scene: run K draws of s distinct points; True iff none is all-inlier (inliers = indices < n_in)."""
    for _ in range(K):
        if all(i < n_in for i in rng.sample(range(N), s)):
            return False
    return True


def ransac_line(pts, K, thr, rng):
    """Fit y = a x + b by RANSAC (s=2, max consensus); returns (a, b)."""
    best, bi = None, -1
    n = len(pts)
    for _ in range(K):
        i, j = rng.sample(range(n), 2)
        (x1, y1), (x2, y2) = pts[i], pts[j]
        if x1 == x2:
            continue
        a = (y2 - y1) / (x2 - x1)
        b = y1 - a * x1
        c = sum(1 for x, y in pts if abs(y - a * x - b) <= thr)
        if c > bi:
            best, bi = (a, b), c
    return best
