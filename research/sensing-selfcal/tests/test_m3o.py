"""Milestone 3o: the offset-aware window solve (experiments/m3o_offset/tsba.py) and its gyro."""
import importlib.util, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, os.path.join(EXP, "m3o_offset"))
import tsba  # noqa: E402

_s = importlib.util.spec_from_file_location("m3o_run", os.path.join(EXP, "m3o_offset", "run.py"))
run = importlib.util.module_from_spec(_s)
_s.loader.exec_module(run)
m3k, m3l, m3m = run.m3k, run.m3l, run.m3m


def test_gyro_signal_is_the_shifted_rate_and_interpolates_to_it():
    s, g = run.gyro_samples(3, 0.010)
    s0, g0 = run.gyro_samples(3, 0.0)
    tk = m3m.kf_times()
    # noise is the same draw at every delta, so the difference is the shift alone
    assert np.allclose(g - g0, m3m.w_of_t(3, s + 0.010) - m3m.w_of_t(3, s), atol=1e-12)
    assert s[0] < tk[0] - 0.05 and s[-1] > tk[-1] + 0.05
    # reading at t - delta undoes the shift (to interpolation and noise error)
    est = tsba.interp(s, g, tk - 0.010)
    assert np.abs(est - m3m.w_of_t(3, tk)).max() < 0.01


def test_fixed_delta_reproduces_rsba_window_exactly():
    spec = m3m.ref_specs()[0]
    tk = m3m.kf_times()
    wt = m3m.w_of_t(spec["seed"], tk)
    d = m3l.data(dict(spec, w=wt.tolist()), m3k.TR)
    vi, pi, uv, rv0, tv, X0 = d
    gs, gw = run.gyro_samples(spec["seed"], 0.0)
    rates = tsba.interp(gs, gw, tk)
    start = np.array([m3k.INTR[0] * 1.08, m3k.W / 2, m3k.H / 2, 0.0, 0.0])
    a = tsba.TWindow(vi, pi, uv, m3k.NKF, len(X0), tv, gs, gw, tk, m3k.TR, m3k.H, True, False)
    b = tsba.rsba.Window(vi, pi, uv, m3k.NKF, len(X0), tv, rates, m3k.TR, m3k.H, True, False)
    ra = a.solve(start, rv0, tv * 1.0, X0, 0.0, max_iter=15)
    rb = b.solve(start, rv0, tv * 1.0, X0, 0.0, max_iter=15)
    assert np.allclose(ra["intr"], rb["intr"], rtol=0, atol=1e-9)
    assert abs(ra["t_r"] - rb["t_r"]) < 1e-12


def test_delta_jacobian_column_matches_a_finite_difference_of_the_residual():
    spec = m3m.ref_specs()[1]
    tk = m3m.kf_times()
    wt = m3m.w_of_t(spec["seed"], tk)
    vi, pi, uv, rv0, tv, X0 = m3l.data(dict(spec, w=wt.tolist()), m3k.TR)
    gs, gw = run.gyro_samples(spec["seed"], 0.007)
    win = tsba.TWindow(vi, pi, uv, m3k.NKF, len(X0), tv, gs, gw, tk, m3k.TR, m3k.H, False, True, 0.0021)
    c, x = win.to_q(m3k.INTR.copy(), rv0, tv, X0, m3k.TR, np.zeros((m3k.NKF, 3)))
    assert c[-1] == 0.0021
    intr, rv, tv_, X, t_r, u = win.from_q(c, x)
    Jc, _ = win.obs_jac(intr, rv, tv_, X, t_r, u)
    assert Jc.shape[2] == len(c)
    h = 1e-6
    cp, cm = c.copy(), c.copy(); cp[-1] += h; cm[-1] -= h
    rp = win.res(*win.from_q(cp, x)); rm = win.res(*win.from_q(cm, x))
    assert np.allclose(Jc[:, :, -1], (rp - rm) / (2 * h), atol=1e-3)
