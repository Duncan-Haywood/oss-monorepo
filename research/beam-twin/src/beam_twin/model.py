"""Detecting a thin obstacle with a scanning lidar while braking. A scan has beams every `delta` radians with a uniformly
random phase, so an obstacle of width w at range r covers lam = w/(r*delta) beams on average: N = floor(lam) + Bernoulli(frac(lam))
exactly. Each beam returns independently with probability q (real sensor: dark, wet or grazing surfaces drop returns; twin: q = 1).
A real scan may also "fade": with probability s every beam on the obstacle is lost together (wet or dark surface, sun glare, dust
cloud), otherwise beams return independently. A twin calibrated on the per-beam return rate sees only q_eff = (1-s)*q and no fades.
A scan confirms the obstacle if at least m beams return. The vehicle closes at speed v, scanning at f Hz, so scans occur every v/f
metres from first visibility R0; it must confirm before the stopping distance d(v) = v*t_react + v^2/(2a). Scans are independent
(random phase). Miss probability = product over scans at ranges >= d(v) of the per-scan miss probability. Pure Python."""
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Scene:
    w: float = 0.5          # obstacle width, m
    delta: float = 0.0035   # angular resolution, rad (about 0.2 deg)
    f: float = 10.0         # scan rate, Hz
    R0: float = 150.0       # range at which the obstacle first becomes visible to scanning, m
    a: float = 4.0          # braking deceleration, m/s^2
    t_react: float = 0.5    # reaction time, s
    m: int = 1              # returns needed to confirm


def stop_distance(v, sc):
    return v * sc.t_react + v * v / (2 * sc.a)


def binom_miss(n, q, m):
    """P(Binomial(n, q) < m)."""
    if n < m:
        return 1.0
    return sum(math.comb(n, i) * q ** i * (1 - q) ** (n - i) for i in range(m))


def scan_miss(r, q, sc, s=0.0):
    """Exact per-scan probability of fewer than m returns from an obstacle at range r (fade probability s)."""
    lam = sc.w / (r * sc.delta)
    n0 = math.floor(lam)
    th = lam - n0
    return s + (1 - s) * ((1 - th) * binom_miss(n0, q, sc.m) + th * binom_miss(n0 + 1, q, sc.m))


def n_scans(v, sc):
    """Number of scans that can still confirm the obstacle before the stopping distance."""
    d = stop_distance(v, sc)
    if sc.R0 < d:
        return 0
    return int(math.floor((sc.R0 - d) * sc.f / v + 1e-12)) + 1


def scan_ranges(v, sc):
    """Ranges of those scans, lazily (far to near): scans are v/f metres apart starting at R0."""
    step = v / sc.f
    for i in range(n_scans(v, sc)):
        yield sc.R0 - i * step


def miss_probability(v, q, sc, s=0.0):
    """P(no scan confirms the obstacle before the vehicle needs to start braking at its stopping distance)."""
    if v <= 0:
        return 0.0  # a stationary vehicle cannot miss an obstacle it never approaches
    if s >= 1.0:
        return 1.0
    p = 1.0
    for r in scan_ranges(v, sc):
        p *= scan_miss(r, q, sc, s)
        if p == 0.0:
            break
    return p


def safe_speed(delta_level, q, sc, s=0.0, vmax=60.0, vmin=0.5):
    """Largest speed with miss probability <= delta_level (bisection; miss probability is increasing in v). Returns 0 if even
    vmin m/s is not certifiable."""
    if miss_probability(vmin, q, sc, s) > delta_level:
        return 0.0
    if miss_probability(vmax, q, sc, s) <= delta_level:
        return vmax
    lo, hi = vmin, vmax
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if miss_probability(mid, q, sc, s) <= delta_level:
            lo = mid
        else:
            hi = mid
    return lo


def fade_floor(v, s, sc):
    """Lower bound on the real miss probability: every scan fades together, s^(number of scans)."""
    return s ** n_scans(v, sc)


def powerlaw_miss(v, q, sc):
    """Continuum approximation for m = 1: replace E[(1-q)^N] by (1-q)^lam and the scan sum by an integral of lam over
    [d, R0]: miss ~ (d/R0)^kappa, kappa = f*w*|ln(1-q)|/(v*delta). Only a rough guide in the regime lam >> 1 (experiments/run.py
    section 7 reports where it holds and where it fails)."""
    d = stop_distance(v, sc)
    kappa = sc.f * sc.w * abs(math.log(1 - q)) / (v * sc.delta)
    return (d / sc.R0) ** kappa


def simulate_miss(rng, v, q, sc, runs, s=0.0):
    """Monte Carlo of the beam pattern itself: random phase, beams at multiples of delta, Bernoulli returns, >= m to confirm."""
    ranges = list(scan_ranges(v, sc))
    misses = 0
    for _ in range(runs):
        missed = True
        for r in ranges:
            width = sc.w / r
            phase = rng.random() * sc.delta
            first = math.ceil((0.0 - phase) / sc.delta)  # obstacle occupies [0, width); beams at phase + k*delta
            n = math.floor((width - phase) / sc.delta) - first + 1 if width >= phase else 0
            n = max(n, 0)
            hits = 0 if rng.random() < s else sum(rng.random() < q for _ in range(n))
            if hits >= sc.m:
                missed = False
                break
        misses += missed
    return misses / runs


def estimate_q(rng, q_true, n_beams):
    """Return-rate estimate from n_beams calibration beams on a known target."""
    return sum(rng.random() < q_true for _ in range(n_beams)) / n_beams
