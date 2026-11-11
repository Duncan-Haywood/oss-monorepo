import os, sys
import numpy as np
import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfcal import board_points, project, selfcal, zhang, detect  # noqa: E402

SIZE = (640, 480)
TRUE = np.array([530.0, 330.0, 245.0, -0.25])


def synth(n=8, noise=0.2, seed=0):
    rng = np.random.default_rng(seed)
    X = board_points(square=0.03) - np.array([0.12, 0.075, 0.0])
    obs = []
    for _ in range(n):
        rv = rng.uniform(-0.5, 0.5, 3)
        tv = np.array([rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), rng.uniform(0.35, 0.5)])
        uv, _ = project(TRUE, rv, tv, X, 1)
        obs.append(uv + rng.normal(0, noise, uv.shape))
    return np.array(obs)


def test_project_pinhole_centre():
    uv, z = project(np.array([500.0, 320, 240, 0.0]), np.zeros(3), np.zeros(3),
                    np.array([[0.0, 0, 2.0], [0.2, 0, 2.0]]), 1)
    assert np.allclose(uv[0], [320, 240]) and np.allclose(uv[1], [370, 240]) and np.all(z == 2)


def test_selfcal_recovers_focal_from_30pct_wrong_start():
    obs = synth()
    s = selfcal(obs, SIZE, 1.3 * TRUE[0], nk=1, ref=0)
    assert abs(s["f"] - TRUE[0]) < 4 * s["sf"] + 1.0
    assert abs(s["k1"] - TRUE[3]) < 0.02
    assert 0.15 < s["rms"] < 0.25  # noise 0.2 px per coordinate


def test_covariance_has_seven_gauge_directions():
    s = selfcal(synth(seed=1), SIZE, 0.8 * TRUE[0], nk=1, ref=0)
    assert s["sv_gauge_ratio"] < 0.05 * s["sv_min_kept"]


def test_zhang_on_noise_free_synthetic():
    obs = synth(noise=0.0, seed=2)
    z = zhang(list(obs), SIZE, k2=False)
    assert abs(z["f"] - TRUE[0]) < 0.5 and abs(z["k1"] - TRUE[3]) < 1e-3


def test_real_image_detection():
    c, size = detect(os.path.join(os.path.dirname(__file__), "..", "data", "left01.jpg"))
    assert c.shape == (54, 2) and size == SIZE


def test_analytic_jacobian_matches_finite_differences():
    from selfcal import _fun_jac_fixed, init_fronto
    obs = synth(n=4, noise=0.0, seed=3)
    X, poses = init_fronto(obs, SIZE, 600.0, 0)
    p = np.concatenate([[600.0, 320, 240, -0.1], np.delete(poses, 0, 0).ravel(), np.delete(X.ravel(), 2)])
    a = (obs, 1, poses[0], 0)
    J = _fun_jac_fixed(p, *a, True).toarray()
    r0 = _fun_jac_fixed(p, *a, False)
    Jn = np.empty_like(J)
    for i in range(len(p)):
        q = p.copy(); h = 1e-6 * max(1.0, abs(p[i])); q[i] += h
        Jn[:, i] = (_fun_jac_fixed(q, *a, False) - r0) / h
    assert np.abs(J - Jn).max() < 1e-5 * np.abs(J).max()


def test_gauge_fixed_solver_converges_and_is_well_posed():
    from selfcal import selfcal_fixed_analytic
    obs = synth(n=8, noise=0.2, seed=1)
    s = selfcal_fixed_analytic(obs, SIZE, 1.3 * TRUE[0], nk=1)
    assert s["status"] > 0 and s["nfev"] < 200          # converged, not capped
    assert s["cond_full"] < 1e12                          # no gauge left in the normal matrix
    assert abs(s["f"] - TRUE[0]) < 4 * s["sf"] + 1.0


def test_spread_of_parallel_normals_is_zero():
    from selfcal import spread_deg
    n = np.array([[0, 0, 1.0], [0, 0, 2.0], [0, np.sin(0.1), np.cos(0.1)]])
    assert spread_deg(n[:2]) < 1e-6 and abs(spread_deg(n) - np.degrees(0.1)) < 1e-6
