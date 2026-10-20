import math
from capture_rig.model import (ring, rms_error, max_gap_deg, mean_view_miss_deg,
                               f_px, pixels_on_subject, fits, covariance)

R, FOV = 3.0, 60.0


def test_ring_geometry():
    c = ring(8, R)
    assert len(c) == 8
    assert all(abs(math.hypot(x, y) - R) < 1e-9 for x, y in c)
    assert abs(max_gap_deg(c) - 45) < 1e-9


def test_opposite_pair_is_degenerate():
    assert rms_error(ring(2, R), FOV) is None


def test_single_camera_has_no_triangulation():
    assert covariance(ring(1, R), FOV) is None


def test_more_cameras_never_worse():
    e = [rms_error(ring(n, R), FOV) for n in (3, 4, 6, 8, 12)]
    assert all(a > b for a, b in zip(e, e[1:]))


def test_wider_baseline_helps():
    def err(g):
        return rms_error(ring(2, R, span_deg=g, start_deg=-g / 2), FOV)
    assert err(10) > err(40) > err(90)


def test_error_scales_with_distance_squared_at_fixed_angle():
    e3 = rms_error(ring(2, 3.0, span_deg=40, start_deg=-20), FOV)
    e6 = rms_error(ring(2, 6.0, span_deg=40, start_deg=-20), FOV)
    assert abs(e6 / e3 - 2.0) < 1e-6      # fixed convergence angle: error is linear in z


def test_mean_miss_is_quarter_of_gap_for_even_ring():
    for n in (4, 8, 12):
        assert abs(mean_view_miss_deg(ring(n, R)) - 90 / n) < 0.02


def test_pixels_and_fit():
    assert fits(3.0, 60) and not fits(3.0, 30)
    assert abs(pixels_on_subject(3.0, 60) - 1.8 * f_px(60) / 3.0) < 1e-9
