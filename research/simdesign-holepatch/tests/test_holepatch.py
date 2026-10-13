import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_holepatch import plate_field, patch_peak, kirsch_sxx, kirsch_patch
from simdesign_holepatch.field import Plate


def test_kirsch_hole_edge_values():
    assert abs(kirsch_sxx(0.0, 1.0, 1.0) - 3.0) < 1e-12      # top of the hole: concentration 3
    assert abs(kirsch_sxx(1.0, 0.0, 1.0)) < 1e-12            # side of the hole: stress free
    assert abs(kirsch_sxx(1e4, 3.0, 1.0) - 1.0) < 1e-3       # far field: applied stress


def test_kirsch_patch_falls_with_radius_and_tends_to_3():
    v = [kirsch_patch(1.0, r) for r in (0.02, 0.1, 0.25, 0.5)]
    assert all(a > b for a, b in zip(v, v[1:]))
    assert 2.9 < v[0] < 3.0


def test_patch_zero_is_pointwise_max():
    fd = plate_field(Plate(W=60, d=6, n_hole=48))
    assert patch_peak(fd, 0.0) == fd["s"].max()


def test_patch_never_exceeds_peak_and_falls_with_radius():
    fd = plate_field(Plate(W=60, d=6, n_hole=96))
    p = [patch_peak(fd, r) for r in (0.0, 0.3, 0.75, 1.5)]
    assert all(a >= b for a, b in zip(p, p[1:]))


def test_small_hole_patch_matches_kirsch_within_3_percent():
    fd = plate_field(Plate(W=60, d=3, n_hole=192))
    a = 1.5
    for f in (0.1, 0.25):
        fe = patch_peak(fd, f * a) / fd["gross"]
        assert abs(fe / kirsch_patch(1.0, f) - 1) < 0.03


def test_no_hole_field_is_uniform():
    fd = plate_field(Plate(W=30, d=0.0))
    assert abs(fd["s"].mean() / fd["gross"] - 1) < 0.01
