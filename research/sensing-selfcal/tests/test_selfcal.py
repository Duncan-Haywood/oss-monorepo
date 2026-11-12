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


def test_robust_sigma_matches_gauss_newton_on_iid_noise():
    # With independent equal-variance pixel noise and the right model, the sandwich
    # and jackknife sigmas estimate the same thing as the Gauss-Newton sigma.
    from selfcal import selfcal_fixed_analytic, jackknife_sf
    obs = synth(n=8, noise=0.2, seed=3)
    s = selfcal_fixed_analytic(obs, SIZE, 1.3 * TRUE[0], nk=1, ref=0)
    assert 0.5 < s["sf_hc0"] / s["sf"] < 2.0
    assert 0.3 < s["sf_cr_view"] / s["sf"] < 3.0
    j = jackknife_sf(obs, SIZE, 1.3 * TRUE[0])
    assert j["loo_converged"] == 8 and 0.3 < j["sf_jack"] / s["sf"] < 3.0


def test_robust_sigma_sees_per_view_correlated_error():
    # A shared shift per view (a correlated error the iid model ignores) inflates the
    # view-clustered sandwich relative to the Gauss-Newton sigma.
    from selfcal import selfcal_fixed_analytic
    rng = np.random.default_rng(4)
    obs = synth(n=8, noise=0.05, seed=4)
    obs = obs + rng.normal(0, 0.5, (obs.shape[0], 1, 2)) * np.linspace(-1, 1, obs.shape[1])[None, :, None]
    s = selfcal_fixed_analytic(obs, SIZE, 1.3 * TRUE[0], nk=1, ref=0)
    assert s["sf_cr_view"] > 1.5 * s["sf"]


def test_neighbour_corr_white_and_smooth():
    from selfcal import neighbour_corr
    rng = np.random.default_rng(0)
    white = rng.normal(size=(5, 54, 2))
    assert abs(neighbour_corr(white)["both"]) < 0.1
    # a smooth per-view field: neighbours nearly identical
    g = np.mgrid[0:6, 0:9].astype(float)
    field = np.stack([np.sin(g[1] / 4), np.cos(g[0] / 4)], -1).reshape(54, 2)
    smooth = np.stack([field * s for s in rng.normal(size=5)]) + 0.01 * rng.normal(size=(5, 54, 2))
    assert neighbour_corr(smooth)["both"] > 0.9


def test_zhang_ro_recovers_flat_board_on_synthetic_views():
    from selfcal import zhang_ro, board_points, project
    import cv2
    X = board_points()
    intr = np.array([520.0, 320.0, 240.0, -0.2])
    obs = []
    for a in np.linspace(-0.5, 0.5, 6):
        rv = np.array([a, 0.4 * np.cos(3 * a), 0.1])
        tv = np.array([-4.0, -2.5, 12.0])
        uv, _ = project(intr, rv, tv, X, 1)
        obs.append(uv)
    z = zhang_ro(obs, (640, 480), k2=False)
    assert abs(z["f"] - 520.0) < 0.5 and abs(z["cy"] - 240.0) < 0.5
    assert np.abs(z["obj"][:, 2]).max() < 1e-3


def test_match_order_reorders_and_rejects_ambiguous_sets():
    from selfcal import match_order
    rng = np.random.default_rng(1)
    ref = board_points()[:, :2] * 30.0
    perm = rng.permutation(len(ref))
    other = ref[perm] + rng.normal(0, 0.2, ref.shape)
    assert np.allclose(match_order(ref, other), ref, atol=1.0)
    dup = other.copy(); dup[0] = dup[1]
    try:
        match_order(ref, dup)
    except ValueError:
        pass
    else:
        raise AssertionError("a duplicated corner should not match one-to-one")


def test_detectors_find_the_same_corners_on_a_real_image():
    here = os.path.dirname(__file__)
    a, _ = detect(os.path.join(here, "..", "data", "left01.jpg"))
    for m in ("subpix5", "sb"):
        b, _ = detect(os.path.join(here, "..", "data", "left01.jpg"), method=m)
        assert b.shape == (54, 2) and np.median(np.linalg.norm(a - b, axis=1)) < 0.5


def test_residual_structure_null_and_column_offsets():
    from selfcal import residual_structure
    rng = np.random.default_rng(2)
    g = np.mgrid[0:6, 0:9].astype(float)
    obs = np.stack([g[1] * 30, g[0] * 30], -1).reshape(54, 2)[None].repeat(40, 0)  # columns run along image y
    white = residual_structure(rng.normal(size=(40, 54, 2)), obs)
    assert abs(white["col_share"] - 1 / 6) < 0.03 and abs(white["row_share"] - 1 / 9) < 0.03
    assert 0.4 < white["col_perp_share"] < 0.6
    # every column of every view shifted sideways (along image x) by its own offset
    off = np.zeros((40, 6, 9, 2)); off[..., 0] = rng.normal(size=(40, 1, 9))
    s = residual_structure(off.reshape(40, 54, 2) + 0.1 * rng.normal(size=(40, 54, 2)), obs)
    assert s["col_share"] > 0.9 and s["col_perp_share"] > 0.95


def test_column_clustered_sandwich_sees_column_offsets():
    # Per-(view, column) offsets make the Gauss-Newton sigma too small (true sd of f over
    # draws ~5.8 px against a median 3.6 reported); clustering by (view, column) moves it
    # up. One draw is too noisy to test, so compare medians over a few.
    from selfcal import selfcal_fixed_analytic
    obs = synth(n=8, noise=0.05, seed=5)
    s0 = selfcal_fixed_analytic(obs, SIZE, 1.3 * TRUE[0], nk=1, ref=0)
    assert 0.3 < s0["sf_cr_viewcol"] / s0["sf"] < 3.0
    ratio = []
    for t in range(8):
        rng = np.random.default_rng(100 + t)
        b = obs.reshape(8, 6, 9, 2) + rng.normal(0, 0.5, (8, 1, 9, 2))
        s = selfcal_fixed_analytic(b.reshape(8, 54, 2), SIZE, 1.3 * TRUE[0], nk=1, ref=0)
        ratio.append(s["sf_cr_viewcol"] / s["sf"])
    assert np.median(ratio) > 1.05


def test_disturbance_is_an_exact_model_change():
    # Milestone 4: re-solving the disturbed corners gives the transformed solution, so the
    # disturbance experiments can transform the undisturbed solutions instead of re-solving.
    from selfcal import selfcal_fixed_best, disturb_obs, disturb_solution
    obs = synth(n=6, seed=3)
    a = selfcal_fixed_best(obs, SIZE, 1.3 * TRUE[0], nk=1, refs=(0,))
    for s, du in ((1.02, 0.0), (1.0, 5.0), (0.97, -3.0)):
        b = selfcal_fixed_best(disturb_obs(obs, SIZE, s, du), SIZE, 1.3 * TRUE[0], nk=1, refs=(0,))
        th, cov = disturb_solution([a["f"], a["cx"], a["cy"]], np.array(a["cov_intr"])[:3, :3], SIZE, s, du)
        assert np.allclose([b["f"], b["cx"], b["cy"]], th, atol=1e-4)
        assert abs(b["k1"] - a["k1"]) < 1e-7
        assert np.allclose(np.array(b["cov_intr"])[:3, :3], cov, rtol=1e-4, atol=1e-8)


def test_update_test_and_decision():
    from selfcal import update_test, decide, CHI2_3_99
    cov = np.diag([1.0, 4.0, 4.0])
    assert update_test([500, 320, 240], cov, [500, 320, 240], cov) == 0.0
    # f moves by 2: d^2 / (1 + 1) = 2; with kappa 2 it is a quarter of that
    assert np.isclose(update_test([500, 320, 240], cov, [502, 320, 240], cov), 2.0)
    assert np.isclose(update_test([500, 320, 240], cov, [502, 320, 240], cov, kappa=2.0), 0.5)
    assert decide(CHI2_3_99 - 1, 1.0, 500) == "keep"
    assert decide(CHI2_3_99 + 1, 2.0, 500) == "adopt"
    assert decide(CHI2_3_99 + 1, 3.0, 500) == "flag"


def test_view_clustered_covariance_matrix_matches_scalar_and_is_psd():
    # Milestone 4b: the 3x3 (here 4x4) view-clustered sandwich generalises sf_cr_view.
    from selfcal import selfcal_fixed_analytic
    obs = synth(n=6, noise=0.2, seed=5)
    s = selfcal_fixed_analytic(obs, SIZE, 1.3 * TRUE[0], nk=1, ref=0)
    C = np.array(s["cov_intr_cr_view"])
    assert C.shape == (4, 4)
    assert np.allclose(C, C.T)
    assert np.isclose(np.sqrt(C[0, 0]), s["sf_cr_view"], rtol=1e-8)
    assert np.linalg.eigvalsh(C).min() > -1e-9 * np.abs(C).max()


def test_jackknife_cov_known_values():
    # (m - 1)/m sum of outer products of deviations; non-finite rows are dropped.
    from selfcal import jackknife_cov
    t = np.array([[1.0, 0.0], [3.0, 2.0], [2.0, 1.0], [np.nan, 5.0]])
    d = t[:3] - t[:3].mean(axis=0)
    assert np.allclose(jackknife_cov(t), 2 / 3 * d.T @ d)
    assert np.isnan(jackknife_cov(t[:1])).all()
    # Leave-one-out means of iid draws: the jackknife variance of the mean is the usual s^2 / n.
    x = np.random.default_rng(0).normal(size=(20, 1))
    loo = np.array([(x.sum() - x[i]) / 19 for i in range(20)])
    assert np.isclose(jackknife_cov(loo)[0, 0], x.var(ddof=1) / 20)


def test_satterthwaite_and_hotelling_reference():
    from selfcal import satterthwaite_nu, hotelling_crit, CHI2_3_99
    # one variance only: nu is that estimate's own degrees of freedom
    assert abs(satterthwaite_nu(2.0, 0.0, 7, 5) - 6.0) < 1e-12
    # equal variances and counts: nu = 2 (m - 1)
    assert abs(satterthwaite_nu(1.0, 1.0, 5, 5) - 8.0) < 1e-12
    # Hotelling tends to chi^2_3 for large nu, is larger for small nu, and is undefined at nu <= 2
    assert abs(hotelling_crit(3, 1e7) - CHI2_3_99) < 1e-3
    assert hotelling_crit(3, 6.0) > 2 * CHI2_3_99
    assert np.isnan(hotelling_crit(3, 2.0))
    # p = 1: the square of Student's t
    from scipy.stats import t
    assert abs(hotelling_crit(1, 5.0) - t.ppf(0.995, 5) ** 2) < 1e-9
