"""Two-pin printed cover: does it assemble, and what nominal clearance buys a given yield?

A base carries two pins, a cover has two holes. Each pin/hole centre has an independent 2-D Gaussian
position error (sd sp per axis), each pin diameter and hole diameter an independent Gaussian size error.
The cover may translate freely (no rotation). It fits iff the translation t exists with
|hole_i - pin_i - t| <= r_i for both i, where r_i = (D_i - d_i)/2 is the radial clearance; that is the
intersection of two disks, non-empty iff |delta1 - delta2| <= r1 + r2 (delta_i = hole_i - pin_i) and each r_i >= 0.
"""
import math
import random


def fits(delta1, delta2, r1, r2):
    """Exact translation-only fit test for one assembly."""
    if r1 < 0 or r2 < 0:
        return False
    return math.hypot(delta1[0] - delta2[0], delta1[1] - delta2[1]) <= r1 + r2


def sample_fit(rng, c, sp, sd, bias=0.0, pitch_dev=None):
    """One random assembly. c: nominal diametral clearance (mm); sp: position sd per axis;
    sd: sd of each diameter; bias: hole diameter minus nominal (mm), pins unbiased."""
    def hole_dev():
        return (rng.gauss(0, sp), rng.gauss(0, sp))
    def pin_dev():
        return (rng.gauss(0, sp), rng.gauss(0, sp))
    deltas = []
    for _ in range(2):
        h, p = hole_dev(), pin_dev()
        deltas.append((h[0] - p[0], h[1] - p[1]))
    radii = []
    for _ in range(2):
        D = c + bias + rng.gauss(0, sd)
        d = rng.gauss(0, sd)
        radii.append((D - d) / 2)
    return fits(deltas[0], deltas[1], radii[0], radii[1])


def yield_mc(c, sp, sd, bias=0.0, n=20000, seed=0):
    rng = random.Random(seed)
    return sum(sample_fit(rng, c, sp, sd, bias) for _ in range(n)) / n


def yield_closed(c, sp):
    """Exact yield when sizes are exact (sd=0, bias=0): |delta1-delta2| is Rayleigh with per-axis sd 2*sp,
    and r1 + r2 = c, so yield = 1 - exp(-c^2 / (8 sp^2))."""
    return 1.0 - math.exp(-c * c / (8.0 * sp * sp))


def clearance_worst(sp, sd, k=3.0):
    """Worst-case rule: every one of the four centre errors at +-k*sp per axis, in the worst direction, gives
    |delta1 - delta2| <= 4*sqrt(2)*k*sp; every one of four diameters at +-k*sd shrinks r1 + r2 by 2*k*sd.
    A nominal diametral clearance c = 4*sqrt(2)*k*sp + 2*k*sd then always fits within those bounds."""
    return 4.0 * math.sqrt(2.0) * k * sp + 2.0 * k * sd


def clearance_rss(sp, sd, k=3.0):
    """Root-sum-square rule: |delta1 - delta2| has per-axis sd 2*sp (radial scale 2*sqrt(2)*sp); r1 + r2 has
    sd sd (four diameters, each weighted 1/2). c = k * sqrt(8*sp^2 + sd^2)."""
    return k * math.sqrt(8.0 * sp * sp + sd * sd)


def required_clearance(target, sp, sd, bias=0.0, n=20000, seed=0, hi=4.0):
    """Smallest nominal diametral clearance (mm, bisection, 0.001 mm) whose Monte Carlo yield >= target.
    Same seed at every c (common random numbers) so yield is monotone in c up to ties."""
    lo = 0.0
    if yield_mc(hi, sp, sd, bias, n, seed) < target:
        return None
    while hi - lo > 0.001:
        mid = (lo + hi) / 2
        if yield_mc(mid, sp, sd, bias, n, seed) >= target:
            hi = mid
        else:
            lo = mid
    return hi
