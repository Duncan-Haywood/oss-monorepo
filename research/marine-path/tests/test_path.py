import math
import pytest
from marine_path.boat import Boat, step, wrap
from marine_path.guidance import ILOS, los, steady_los_offset
from marine_path.sim import run


def test_wrap():
    assert wrap(3 * math.pi) == pytest.approx(-math.pi) or wrap(3 * math.pi) == pytest.approx(math.pi)
    assert wrap(0.5) == 0.5


def test_los_zero_on_line_and_sign():
    assert los(0.0, 10.0) == 0.0
    assert los(5.0, 10.0) < 0 < los(-5.0, 10.0)


def test_steady_offset_formula():
    assert steady_los_offset(12, 1.0, 0.0) == 0.0
    assert steady_los_offset(12, 1.0, 1.0) == math.inf
    assert steady_los_offset(10, 1.0, 0.5) == pytest.approx(10 * math.tan(math.pi / 6))


def test_boat_holds_straight_speed():
    b = Boat()
    s = (0, 0, 0, 1.0, 0, 0)
    for _ in range(100):
        s = step(b, s, b.xu2, 0.0, (0, 0), (0, 0, 0), 0.1)
    assert s[3] == pytest.approx(1.0, abs=1e-9) and abs(s[1]) < 1e-12


def test_simulated_los_matches_analytic_offset():
    r = run("los", delta=12.0, cur=(0, 0.3), T=600.0)
    assert r["y_end"] == pytest.approx(steady_los_offset(12.0, 1.0, 0.3), rel=0.01)


def test_ilos_removes_offset():
    r = run("ilos", delta=12.0, kappa=1.0, cur=(0, 0.3), T=600.0)
    assert abs(r["y_end"]) < 0.05


def test_no_current_both_converge():
    for c, k in (("los", 0.0), ("ilos", 1.0)):
        assert run(c, kappa=k, cur=(0, 0), T=300.0)["rms_xte"] < 0.5
