import numpy as np
from sensing_recon import (make_object, orbit_cameras, project, visible, triangulate_all,
                           surface_error, run_trial, SURFACE)
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
