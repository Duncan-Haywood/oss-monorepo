import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


th = _mod("transit_hold_test", "transit_hold.py")


def _mc_wait(alpha, tau, r, v, n=200000, seed=1):
    """Random arrivals into a Poisson stream of disc entries with chord dwell (uniform offset); wait until nobody
    is inside and nobody enters for tau seconds."""
    rng = np.random.default_rng(seed)
    T = n / alpha
    t = np.sort(rng.uniform(0, T, n))
    u = rng.uniform(-r, r, n)
    dwell = 2 * np.sqrt(r * r - u * u) / v
    leave = np.maximum.accumulate(t + dwell)        # latest exit among entries so far
    waits = []
    for s in rng.uniform(0.1 * T, 0.9 * T, 4000):
        k = np.searchsorted(t, s)                   # first entry at or after s
        now = s
        while True:
            busy_until = leave[k - 1] if k > 0 else -np.inf
            if busy_until > now:
                now = busy_until
                continue
            if k < n and t[k] < now + tau:          # an entry inside the window: wait for it to clear
                now = leave[k]
                k += 1
                while k < n and t[k] <= now:
                    now = max(now, leave[k])
                    k += 1
                continue
            break
        waits.append(now - s)
    return float(np.mean(waits))


def test_adams_small_and_zero_limits():
    assert float(th.adams(0.0, 10.0)) == 0.0
    a, G = 1e-5, 10.0
    assert abs(float(th.adams(a, G)) - a * G * G / 2) < 1e-3 * a * G * G


def test_adams_with_mean_dwell_matches_chord_dwell_monte_carlo():
    for alpha, r in ((0.02, 20.0), (0.05, 50.0)):
        v, tau = 12.0, 3.43
        d = (math.pi * r / 2) / v                   # mean chord / speed
        exact = float(th.adams(alpha, tau + d))
        mc = _mc_wait(alpha, tau, r, v)
        assert abs(mc / exact - 1) < 0.15, (alpha, r, mc, exact)


def test_miss_probabilities():
    assert th.p_h(1.0, 2.0) == 1.0
    assert abs(th.p_h(th.LAM_H + 2.0, 1.0) - math.exp(-2.0)) < 1e-12
    assert 0 < th.p_v(th.Z) < 1e-4 < th.p_v(th.LAM_Z)


def test_needed_radius_meets_target_exactly():
    c, T, sg = 1.7e-4, 1e-7, 12.54
    r = th.r_needed(c, T, sg, th.Z)
    assert abs(c * (th.p_h(r, sg) + th.p_v(th.Z)) - T) < 1e-12
    assert th.r_needed(1e-3, 2.5e-9, 1.0, th.LAM_Z) is None


def test_hold_interpolation_is_exact_on_grid():
    L = {"hold": [[[float(q + 1)] for q in range(len(th.RADII))]]}
    for q, r in enumerate(th.RADII):
        assert abs(th.hold_at(L, 0, r, 0) - (q + 1)) < 1e-12
