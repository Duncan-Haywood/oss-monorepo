import numpy as np
from sensing_ba import perturb_cameras, umeyama, run_trial  # imports sensing_recon onto the path
from sensing_recon import orbit_cameras


def test_umeyama_recovers_similarity():
    rng = np.random.default_rng(0)
    a = rng.normal(size=(50, 3))
    th = 0.7
    R = np.array([[np.cos(th), -np.sin(th), 0], [np.sin(th), np.cos(th), 0], [0, 0, 1]])
    b = 2.5 * a @ R.T + np.array([1, -2, 3])
    s, R2, t = umeyama(a, b)
    assert abs(s - 2.5) < 1e-9 and np.allclose(R2, R) and np.allclose(t, [1, -2, 3])


def test_zero_perturbation_is_identity():
    cams = orbit_cameras(6)
    out = perturb_cameras(cams, 0.0, 0.0, np.random.default_rng(0))
    assert all(np.allclose(a.R, b.R) and np.allclose(a.t, b.t) for a, b in zip(cams, out))


def test_perturbation_moves_cameras():
    cams = orbit_cameras(6)
    out = perturb_cameras(cams, 1.0, 0.05, np.random.default_rng(0))
    assert not np.allclose(out[0].t, cams[0].t)


def test_wrong_poses_hurt_and_ba_repairs():
    r = run_trial(rot_deg=1.0, trans=0.05, seed=0, n_feat=150)
    assert r["tri_aligned"] > 5 * r["true_pose"]
    assert r["ba"] < 1.5 * r["true_pose"]


def test_no_pose_error_ba_matches_true_pose():
    r = run_trial(rot_deg=0.0, trans=0.0, seed=1, n_feat=150)
    assert abs(r["ba"] - r["true_pose"]) < 0.5 * r["true_pose"]


def test_deterministic():
    assert run_trial(seed=2, n_feat=100) == run_trial(seed=2, n_feat=100)
