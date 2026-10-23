import numpy as np
from sensing_bafocal import project_k, triangulate_f, run_trial
from sensing_recon import orbit_cameras, make_object, visible
from sensing_recon.recon import F_PX, project


def test_projection_matches_recon_without_distortion():
    cams = orbit_cameras(4)
    pts, _ = make_object(20, seed=1)
    assert np.allclose(project_k(cams[0], pts, F_PX), project(cams[0], pts))


def test_distortion_pulls_points_inward_for_negative_k1():
    cams = orbit_cameras(4)
    pts, _ = make_object(50, seed=1)
    a, b = project_k(cams[0], pts, F_PX), project_k(cams[0], pts, F_PX, -0.3)
    assert (np.abs(b - [320, 240]).sum(1) <= np.abs(a - [320, 240]).sum(1) + 1e-9).all()


def test_noise_free_triangulation_with_true_focal_is_exact():
    cams = orbit_cameras(8)
    pts, nrm = make_object(60, seed=2)
    vis = np.array([visible(c, pts, nrm) for c in cams])
    uvs = np.array([project(c, pts) for c in cams])
    rec, idx = triangulate_f(cams, uvs, vis, F_PX)
    assert len(idx) > 30 and np.allclose(rec, pts[idx], atol=1e-6)


def test_wrong_focal_hurts_fixed_and_selfcal_repairs():
    r = run_trial(focal_err=0.2, seed=0, n_feat=150)
    assert r["fixed"] > 1.5 * r["oracle"]
    assert r["selfcal"] < 1.3 * r["oracle"]
    assert r["f_err"] < 0.03


def test_correct_focal_selfcal_matches_fixed():
    r = run_trial(focal_err=0.0, seed=0, n_feat=150)
    assert abs(r["selfcal"] - r["fixed"]) < 0.3 * r["fixed"] + 1e-4


def test_deterministic():
    assert run_trial(seed=1, n_feat=100)["fixed"] == run_trial(seed=1, n_feat=100)["fixed"]
