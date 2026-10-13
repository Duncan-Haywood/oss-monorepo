"""Braking on random terrain. A robot at speed v0 decelerates at g*mu(x); v^2 = v0^2 - 2g*int mu dx, so it stops at the
first D with int_0^D mu dx = W0 := v0^2/(2g) ("friction-metres"). Terrain friction is piecewise constant on patches of
length L, i.i.d. Gamma(shape k, mean m) across patches. Twin-mean stopping distance d0 = W0/m.

Exact law (start on a patch boundary): D > s  <=>  int_0^s mu < W0. For s = j*L the integral is L * (sum of j patches),
the mean of j patches is Gamma(shape j*k, mean m), so P(D > s) = P(jk, jk*c/m) with c = W0/s and P the regularised lower
incomplete gamma function. A twin with n independent cells across the distance has the same law with j -> n.
Pure Python."""
import math
import random


def gammainc_lower(a, x):
    """Regularised lower incomplete gamma P(a, x) (series for x < a+1, Lentz continued fraction otherwise)."""
    if x <= 0:
        return 0.0
    lg = math.lgamma(a)
    if x < a + 1:
        term = total = 1.0 / a
        n = a
        for _ in range(100000):
            n += 1
            term *= x / n
            total += term
            if abs(term) < abs(total) * 1e-16:
                break
        return total * math.exp(-x + a * math.log(x) - lg)
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 100000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-16:
            break
    return 1 - math.exp(-x + a * math.log(x) - lg) * h


def mean_cdf(c, j, k):
    """P(mean of j i.i.d. Gamma(k, mean 1) patches < c) = P(jk, jk*c)."""
    return gammainc_lower(j * k, j * k * c)


def mean_quantile(delta, j, k):
    """Lower delta-quantile q of the mean of j Gamma(k, mean 1) patches (bisection)."""
    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if mean_cdf(mid, j, k) < delta:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def certified_factor(delta, n, k):
    """Distance, in units of d0 = W0/m, that a twin with n independent cells across it certifies at level delta."""
    return 1.0 / mean_quantile(delta, n, k)


def real_exceedance(factor, j, k):
    """Real P(D > factor*d0) when j independent patches span that distance."""
    return mean_cdf(1.0 / factor, j, k)


def stop_distance(rng, L, k, W0, m=1.0, phase=True):
    """Simulate the braking: integrate friction work patch by patch until it reaches W0; return D."""
    used = 0.0
    x = 0.0
    first = rng.uniform(0, L) if phase else L
    seg = first
    while True:
        mu = rng.gammavariate(k, m / k)
        w = mu * seg
        if used + w >= W0:
            return x + (W0 - used) / mu
        used += w
        x += seg
        seg = L
