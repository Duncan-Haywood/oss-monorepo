import math
import pytest
from marine_hull.foil import foil_drag
from marine_hull.hull import G


def test_lift_equals_weight():
    d, cl = foil_drag(5.0, 200.0, 0.05, 8.0)
    assert 0.5 * 1025.0 * 25.0 * 0.05 * cl == pytest.approx(200.0 * G)


def test_induced_drag_only_limit():
    # no profile drag, no struts, no multiplier: D = W^2 / (q pi e AR b^2 / b^2) = (W/q)^2 q / (pi e AR S)
    v, m, s, ar, e = 4.0, 100.0, 0.04, 10.0, 0.9
    d, _ = foil_drag(v, m, s, ar, e=e, cd0=0.0, n_struts=0, extra=1.0)
    q = 0.5 * 1025.0 * v * v
    assert d == pytest.approx((m * G) ** 2 / (q * s * math.pi * e * ar), rel=1e-12)


def test_drag_rises_with_aspect_ratio_drop():
    assert foil_drag(5.0, 200.0, 0.05, 6.0)[0] > foil_drag(5.0, 200.0, 0.05, 12.0)[0]
