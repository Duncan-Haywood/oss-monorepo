import numpy as np
from sensing_recon import (make_object, orbit_cameras, project, visible, triangulate_all,
                           surface_error, run_trial, perturb_rotation, SURFACE)
from sensing_recon.recon import _implicit


def test_object_points_lie_on_surface():
    pts, _ = make_object(200, seed=1)
    assert np.abs(_implicit(pts, SURFACE)).max() < 1e-9


def test_normals_unit_and_outward():
    pts, nrm = make_object(200, seed=1)
    assert np.allclose(np.linalg.norm(nrm, axis=1), 1)
    assert (np.sum(pts * nrm, axis=1) > 0).all()


def test_camera_looks_at_origin():
    for c in orbit_cameras(5, 360):
        uv = project(c, np.zeros((1, 3)))[0]
        assert np.allclose(uv, [320, 240], atol=1e-6)
        assert np.allclose(np.linalg.det(c.R), 1)


def test_full_orbit_spacing():
    cams = orbit_cameras(4, 360)
    centres = np.array([c.centre() for c in cams])
    assert np.allclose(np.linalg.norm(centres[0] - centres[2]), 2 * np.linalg.norm(centres[0][:2]))


def test_triangulation_exact_without_noise():
    pts, nrm = make_object(100, seed=2)
    cams = orbit_cameras(8, 360)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    uvs = np.array([project(c, pts) for c in cams])
    rec, idx = triangulate_all(cams, uvs, vis)
    assert len(rec) > 50
    assert np.abs(rec - pts[idx]).max() < 1e-6


def test_single_view_triangulates_nothing():
    pts, nrm = make_object(50, seed=3)
    cams = orbit_cameras(1)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    rec, _ = triangulate_all(cams, np.array([project(c, pts) for c in cams]), vis)
    assert len(rec) == 0


def test_surface_error_zero_on_surface_and_positive_off():
    pts, _ = make_object(50, seed=5)
    assert surface_error(pts).max() < 1e-9
    assert surface_error(pts * 1.1).min() > 0.05


def test_more_views_more_completeness():
    few = np.mean([run_trial(3, 360, 0.5, s, n_feat=300)["completeness"] for s in range(3)])
    many = np.mean([run_trial(12, 360, 0.5, s, n_feat=300)["completeness"] for s in range(3)])
    assert many > few


def test_noise_raises_error():
    lo = run_trial(8, 360, 0.0, 0, n_feat=300)["mean_err"]
    hi = run_trial(8, 360, 4.0, 0, n_feat=300)["mean_err"]
    assert lo < 1e-6 < hi


def test_pose_error_raises_error():
    lo = run_trial(8, 360, 0.0, 0, n_feat=300)["mean_err"]
    hi = run_trial(8, 360, 0.0, 0, n_feat=300, pose_sigma_deg=1.0)["mean_err"]
    assert hi > lo


def test_deterministic():
    a = run_trial(6, 360, 1.0, 4, n_feat=200)
    b = run_trial(6, 360, 1.0, 4, n_feat=200)
    assert a == b


# Added in quality round 94 (2026-11-22): each pins a quantity the earlier tests left free.

def test_error_per_pixel_matches_first_order_prediction():
    # First-order propagation (Hartley & Zisserman 2004, ch. 5) of 1 px noise through the
    # 12-view rig predicts a mean radial error of 0.0028 radii; an independent midpoint
    # triangulation gave the same. A wrong noise scale moves this by a factor.
    e = np.mean([run_trial(12, 360, 1.0, s, n_feat=300)["mean_err"] for s in range(3)])
    assert 0.0024 < e < 0.0033


def test_six_view_completeness_pins_visibility_rule():
    c = np.mean([run_trial(6, 360, 0.5, s)["completeness"] for s in range(3)])
    assert 0.53 < c < 0.65   # README and results.txt: 0.588 over 10 seeds


def test_ray_angle_rule_drops_narrow_pairs():
    pts, nrm = make_object(400, seed=7)
    for span, expect_some in [(1.0, False), (8.0, True)]:
        c3 = orbit_cameras(3, span)
        cams = [c3[0], c3[2]]                     # same elevation, rays about 1.2 deg apart at span 1
        vis = np.array([visible(c, pts, nrm) for c in cams])
        assert (vis.sum(0) >= 2).sum() > 50
        rec, _ = triangulate_all(cams, np.array([project(c, pts) for c in cams]), vis)
        assert (len(rec) > 0) == expect_some


def test_elevation_alternates():
    z = np.array([c.centre()[2] for c in orbit_cameras(6, 360)])
    assert np.allclose(z, 4.0 * np.sin(np.radians(30)) * np.array([1, -1, 1, -1, 1, -1]))


def test_surface_error_is_radial_offset():
    pts, _ = make_object(50, seed=8)
    d = pts / np.linalg.norm(pts, axis=1, keepdims=True)
    off = pts + 0.01 * d
    assert np.allclose(surface_error(off), 0.01, atol=1e-12)


def test_radial_offset_bounds_euclidean_distance():
    pts, nrm = make_object(400, seed=9)
    off = pts + 0.005 * nrm                       # Euclidean distance 0.005 to first order
    ratio = surface_error(off) / 0.005
    assert (ratio > 0.99).all() and 1.0 < ratio.mean() < 1.2


def test_perturb_rotation_angle_and_centre():
    cam = orbit_cameras(4, 360)[1]
    w = np.radians([0.6, -0.3, 0.2])
    ang = np.linalg.norm(w)
    for about in (False, True):
        c2 = perturb_rotation(cam, w, about_centre=about)
        cos_t = (np.trace(c2.R @ cam.R.T) - 1) / 2
        assert abs(np.arccos(np.clip(cos_t, -1, 1)) - ang) < 1e-6
        shift = np.linalg.norm(c2.centre() - cam.centre())
        if about:
            assert shift < 1e-12
        else:                                     # t kept: the camera swings about the object
            w_world = cam.R.T @ w                 # the rotation acts in camera axes
            expect = np.linalg.norm(np.cross(w_world, cam.centre()))
            assert abs(shift - expect) < 0.01 * expect and shift > 0.02
