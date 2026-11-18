"""Milestone 3m: the gyro faults (experiments/m3m_gyrofault/run.py) and the scoring in analyse.py."""
import importlib.util, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, os.path.join(EXP, "m3l_gyro"))
import rsba  # noqa: E402


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


run = _load("m3m_run", os.path.join(EXP, "m3m_gyrofault", "run.py"))
ana = _load("m3m_analyse", os.path.join(EXP, "m3m_gyrofault", "analyse.py"))


def test_misalignment_is_a_rotation_of_the_stated_angle_about_one_axis_per_window():
    for th in (1.0, 3.0, 10.0):
        R = run.misalign(7, th)
        assert np.allclose(R @ R.T, np.eye(3), atol=1e-12) and abs(np.linalg.det(R) - 1) < 1e-12
        ang = np.degrees(np.arccos((np.trace(R) - 1) / 2))
        assert abs(ang - th) < 1e-9
    a1 = run.misalign(7, 1.0); a1 = a1 - a1.T
    a10 = run.misalign(7, 10.0); a10 = a10 - a10.T
    ax1 = np.array([a1[2, 1], a1[0, 2], a1[1, 0]])
    ax10 = np.array([a10[2, 1], a10[0, 2], a10[1, 0]])
    assert np.allclose(ax1 / np.linalg.norm(ax1), ax10 / np.linalg.norm(ax10), atol=1e-9)


def test_smooth_rate_has_the_stated_sd_and_is_continuous():
    t = np.linspace(0, 400, 400_001)
    sds = [run.w_of_t(s, t).std(0) for s in range(3)]
    assert np.allclose(np.mean(sds, axis=0), run.SIGMA, rtol=0.02)
    w0, w1 = run.w_of_t(0, [1.0]), run.w_of_t(0, [1.0 + 1e-6])
    assert np.abs(w1 - w0).max() < 1e-4


def test_a_scale_error_is_absorbed_by_the_readout_exactly():
    rng = np.random.default_rng(0)
    n = 50
    X = np.c_[rng.uniform(-1, 1, (n, 2)), rng.uniform(2, 4, n)]
    rv, tv = rng.normal(0, 0.1, (n, 3)), rng.normal(0, 0.1, (n, 3))
    w, u, row = rng.normal(0, 0.3, (n, 3)), np.zeros((n, 3)), rng.uniform(-0.5, 0.5, n)
    intr = np.array([518.28, 315.7, 260.1, 0.25, -0.75])
    tr, s = 1 / 30, 1.05
    a = rsba.project(intr, rv, tv, X, w, u, tr * row)
    b = rsba.project(intr, rv, tv, X, s * w, u, tr / s * row)
    assert np.abs(a - b).max() < 1e-9


def test_paired_delta_and_spearman_on_known_cases():
    j = {"known": {"intr": [500.0]}, "R1_known": {"intr": [505.0]}, "T_known": {"intr": [490.0]},
         "T2_known": {"intr": [491.0]}}
    assert abs(ana.delta(j, "R1", "known", 500.0) - 0.01) < 1e-12
    assert abs(ana.delta(j, "T2", "known", 500.0, "T_") - 0.002) < 1e-12
    assert abs(ana.spearman(np.array([1, 2, 3.0]), np.array([10, 20, 30.0])) - 1) < 1e-12
    assert abs(ana.spearman(np.array([1, 2, 3.0]), np.array([3, 2, 1.0])) + 1) < 1e-12


def test_late_gyro_error_scales_with_the_offset():
    tk = run.kf_times()
    e = [np.sqrt(((run.w_of_t(3, tk + d) - run.w_of_t(3, tk)) ** 2).mean()) for d in (0.002, 0.004)]
    assert 1.8 < e[1] / e[0] < 2.2
