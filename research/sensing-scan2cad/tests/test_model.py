import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_scan2cad import (Part, sample_part, add_noise, ransac_planes, fit_circle, fit_part,
                              dimension_errors, cadquery_script)
from sensing_scan2cad.model import _circle3


def test_samples_lie_on_surface():
    part = Part()
    pts = sample_part(part, 4000, np.random.default_rng(0))
    on_box = (np.isclose(pts[:, 0], 0) | np.isclose(pts[:, 0], part.length) | np.isclose(pts[:, 1], 0)
              | np.isclose(pts[:, 1], part.width) | np.isclose(pts[:, 2], 0) | np.isclose(pts[:, 2], part.thickness))
    on_hole = np.zeros(len(pts), bool)
    for cx, cy in part.centres():
        on_hole |= np.isclose(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy), part.hole_d / 2)
    assert (on_box | on_hole).all()


def test_no_points_inside_holes_on_faces():
    part = Part()
    pts = sample_part(part, 4000, np.random.default_rng(1))
    for cx, cy in part.centres():
        assert (np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) >= part.hole_d / 2 - 1e-9).all()


def test_area_weighting_matches_areas():
    part = Part()
    pts = sample_part(part, 40000, np.random.default_rng(2))
    top = np.isclose(pts[:, 2], part.thickness).mean()
    r = part.hole_d / 2
    area = 2 * (part.length * part.width - 2 * np.pi * r * r) + 2 * part.width * part.thickness \
        + 2 * part.length * part.thickness + 2 * 2 * np.pi * r * part.thickness
    assert abs(top - (part.length * part.width - 2 * np.pi * r * r) / area) < 0.01


def test_noise_std_and_outliers():
    rng = np.random.default_rng(3)
    pts = np.zeros((50000, 3))
    q = add_noise(pts, 0.3, rng)
    assert abs(q.std() - 0.3) < 0.01
    q2 = add_noise(sample_part(Part(), 5000, rng), 0.0, rng, outlier_frac=0.1)
    assert q2.shape == (5000, 3)


def test_circle3_exact():
    c = _circle3(np.array([[1.0, 0], [0, 1.0], [-1.0, 0]]))
    assert np.allclose(c, (0, 0, 1))
    assert _circle3(np.array([[0.0, 0], [1, 1], [2, 2]])) is None


def test_fit_circle_recovers_with_strays():
    rng = np.random.default_rng(4)
    th = rng.random(400) * 2 * np.pi
    xy = np.column_stack([5 + 4 * np.cos(th), -2 + 4 * np.sin(th)]) + rng.normal(0, 0.02, (400, 2))
    xy = np.vstack([xy, rng.random((10, 2)) * 20 - 10])
    cx, cy, r = fit_circle(xy, 0.1, rng)
    assert abs(cx - 5) < 0.02 and abs(cy + 2) < 0.02 and abs(r - 4) < 0.02


def test_ransac_finds_six_axis_planes_noiseless():
    part = Part()
    rng = np.random.default_rng(5)
    pts = sample_part(part, 20000, rng)
    planes, rem = ransac_planes(pts, 0.05, rng=rng)
    assert len(planes) == 6
    axes = sorted(int(np.argmax(np.abs(n))) for n, _, _ in planes)
    assert axes == [0, 0, 1, 1, 2, 2]


def test_fit_part_noiseless_is_exact():
    part = Part()
    rng = np.random.default_rng(6)
    dims = fit_part(sample_part(part, 20000, rng), 0.0, rng)
    err = dimension_errors(dims, part.true_dims())
    assert max(abs(v) for v in err.values()) < 0.05


def test_fit_part_low_noise_within_tolerance():
    part = Part()
    rng = np.random.default_rng(7)
    pts = add_noise(sample_part(part, 20000, rng), 0.1, rng)
    err = dimension_errors(fit_part(pts, 0.1, rng), part.true_dims())
    assert max(abs(v) for v in err.values()) < 0.2


def test_other_part_size():
    part = Part(length=60.0, width=30.0, thickness=12.0, hole_d=6.0, hole_gap=30.0)
    rng = np.random.default_rng(8)
    pts = add_noise(sample_part(part, 20000, rng), 0.05, rng)
    err = dimension_errors(fit_part(pts, 0.05, rng), part.true_dims())
    assert max(abs(v) for v in err.values()) < 0.1


def test_failure_returns_none():
    rng = np.random.default_rng(9)
    pts = rng.random((500, 3)) * 10   # no structure
    assert fit_part(pts, 0.1, rng) is None
    assert dimension_errors(None, Part().true_dims()) is None


def test_cadquery_script_contains_dims():
    s = cadquery_script({"length": 80.0, "width": 40.0, "thickness": 10.0, "hole_d": 8.0, "hole_gap": 40.0})
    assert "80.000" in s and "import cadquery" in s
    compile(s, "plate.py", "exec")
