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


ct = _mod("collision_target_test", "collision_target.py")
ll = ct.ll


def test_p_gap_matches_level_leak_overlap_without_offsets():
    for dist in ("normal", "laplace"):
        for gap in (0.0, 3.0, 8.0, 13.33):
            a = float(ct.p_gap(gap, 0.43, 1.0 * math.sqrt(2.0), dist))
            b = ll.p_overlap(gap, 0.43, 1.0, dist)
            assert abs(a - b) <= 1e-12 + 1e-9 * b


def test_widest_spacing_fits_its_band_count():
    for k in range(1, 13):
        assert abs((2 * k - 1) * ct.h_of(k) - 120.0) < 1e-9


def test_enroute_rate_without_offsets_is_the_cost_models_cross_level_terms():
    rng = np.random.default_rng(3)
    m, k, h, lam, sg = 5, 3, 6.0, 7.62, 3.0
    W, X = rng.random((m, m)), rng.random((m, m))
    lab = (0, 2, 1, 2, 0)
    pw, px = ll.level_weights(h, lam, sg / math.sqrt(2.0), k)
    D = np.abs(np.subtract.outer(lab, lab))
    want = float((W * np.where(D > 0, pw[D], 0.0)).sum() + (X * px[D]).sum())
    assert abs(ct.enroute_rate(W, X, lab, h, lam, sg) - want) < 1e-12 * want and want > 0.1


def test_offset_sign_uses_the_upper_drone():
    # one W pair, i above j by one band (2 levels); an offset that lifts the lower drone closes the gap
    W, X = np.array([[0.0, 1.0], [0.0, 0.0]]), np.zeros((2, 2))
    h, lam, sg = 5.0, 0.43, 0.2
    closed = ct.enroute_rate(W, X, (1, 0), h, lam, sg, b=[0.0, 10.0])   # gap 10 + 0 - 10 = 0
    opened = ct.enroute_rate(W, X, (1, 0), h, lam, sg, b=[10.0, 0.0])   # gap 20
    assert closed > 0.9 and opened < 1e-12


def test_first_crossing_target():
    rows = {1: {"x": 1e-9}, 2: {"x": 5e-8}, 3: {"x": 2e-7}, 4: {"x": 5e-8}}
    assert ct.k_target(rows, lambda r: r["x"], 1e-7) == 2
    assert ct.k_target(rows, lambda r: r["x"], 1e-10) == 0


def test_transit_rate_charges_only_transits_from_above():
    A, B = np.array([[0.0, 2.0], [3.0, 0.0]]), np.zeros((2, 2))
    # operator 0 above operator 1: operator 0's flights cross operator 1's levels
    assert ct.transit_rate(A, B, (1, 0), 0.43) == ll.tau_z(0.43) * 2.0
