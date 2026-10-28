import math
import pytest
from marine_hull.hull import G
from marine_hull.planing import lift_force, planing_drag, wetted_length_ratio, best_trim_drag


def test_equilibrium_lift_equals_weight():
    lam = wetted_length_ratio(6.0, 200.0, 0.8, 4.0, 15.0)
    assert lift_force(6.0, 0.8, lam, 4.0, 15.0) == pytest.approx(200.0 * G, rel=1e-9)


def test_flat_plate_lift_matches_hand_value():
    # beta = 0, tau = 4 deg, lam = 1, Cv = 4: CL0 = 4^1.1 (0.012 + 0.0055 / 16)
    v, b = 4.0 * math.sqrt(G * 0.8), 0.8
    cl0 = 4.0 ** 1.1 * (0.012 + 0.0055 / 16.0)
    assert lift_force(v, b, 1.0, 4.0, 0.0) == pytest.approx(cl0 * 0.5 * 1025.0 * v * v * b * b)


def test_deadrise_reduces_lift():
    assert lift_force(6.0, 0.8, 1.5, 4.0, 20.0) < lift_force(6.0, 0.8, 1.5, 4.0, 0.0)


def test_drag_at_least_weight_times_tan_trim():
    d, lam = planing_drag(6.0, 200.0, 0.8, 4.0, 15.0)
    assert d > 200.0 * G * math.tan(math.radians(4.0))


def test_below_cv_one_is_refused():
    assert planing_drag(1.0, 200.0, 0.8, 4.0, 15.0) is None


def test_best_trim_not_worse_than_any_trim():
    best = best_trim_drag(6.0, 200.0, 0.8, 15.0)
    for t in range(2, 16):
        r = planing_drag(6.0, 200.0, 0.8, float(t), 15.0)
        if r:
            assert best[0] <= r[0] + 1e-12
