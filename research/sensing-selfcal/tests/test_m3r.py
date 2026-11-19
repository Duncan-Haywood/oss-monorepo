"""Milestone 3r: the prior-on-intrinsics window solve and its leave-one-out priors (experiments/m3r_prior)."""
import importlib.util, os
import numpy as np
import pytest

pytest.importorskip("cv2")
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
_s = importlib.util.spec_from_file_location("m3r_run", os.path.join(EXP, "m3r_prior", "run.py"))
run = importlib.util.module_from_spec(_s)
_s.loader.exec_module(run)
_o = importlib.util.spec_from_file_location("m3o_run", os.path.join(EXP, "m3o_offset", "run.py"))
m3o = importlib.util.module_from_spec(_o)
_o.loader.exec_module(m3o)
m3k, m3l, m3m = m3o.m3k, m3o.m3l, m3o.m3m


def _window(prior=()):
    spec = m3m.ref_specs()[0]
    tk = m3m.kf_times()
    wt = m3m.w_of_t(spec["seed"], tk)
    vi, pi, uv, rv0, tv, X0 = m3l.data(dict(spec, w=wt.tolist()), m3k.TR)
    gs, gw = m3o.gyro_samples(spec["seed"], 0.0)
    win = run.PWindow(vi, pi, uv, m3k.NKF, len(X0), tv, gs, gw, tk, m3k.TR, m3k.H, True, False, prior=prior)
    start = np.array([m3k.INTR[0] * 1.08, m3k.W / 2, m3k.H / 2, 0.0, 0.0])
    return win, start, rv0, tv, X0


def test_no_prior_reproduces_the_twindow_solve():
    win, start, rv0, tv, X0 = _window()
    ref = run.tsba.TWindow(win.vi, win.pi, win.uv, win.nv, win.npt, tv, win.gs, win.gw, win.kf_t,
                           m3k.TR, m3k.H, True, False)
    a = win.solve(start, rv0, tv * 1.0, X0, 0.0, max_iter=10)
    b = ref.solve(start, rv0, tv * 1.0, X0, 0.0, max_iter=10)
    assert np.allclose(a["intr"], b["intr"], atol=1e-12) and a["prior_cost"] == 0.0


def test_prior_gradient_matches_the_cost_and_pulls_toward_the_mean():
    prior = [(1, 300.0, 2.0), (3, 0.05, 0.01)]
    win, start, rv0, tv, X0 = _window(prior)
    c, x = win.to_q(start, rv0, tv, X0, 0.0, np.zeros((win.nv, 3)))
    _, _, _, gc, _, _, _ = win.blocks(c, x)
    _, _, _, gc0, _, _, _ = run.tsba.TWindow.blocks(win, c, x)
    for j, mu, sc in prior:      # half-gradient of (c_j - mu)^2 / sc^2
        h = 1e-4
        cp, cm = c.copy(), c.copy(); cp[j] += h; cm[j] -= h
        num = (win.prior_cost(cp) - win.prior_cost(cm)) / (4 * h)
        assert abs((gc[j] - gc0[j]) - num) < 1e-6 * max(1.0, abs(num))
    # a very tight prior pins the parameter at its mean
    win2, *_ = _window([(1, 300.0, 1e-4)])
    r = win2.solve(start, rv0, tv * 1.0, X0, 0.0, max_iter=20)
    assert abs(r["intr"][1] - 300.0) < 0.05
    assert abs(r["image_cost"] + r["prior_cost"] - r["cost"]) < 1e-9


def test_priors_leave_the_window_out_and_cross_uses_the_other_sequence():
    def w(seq, unit, i, cx):
        return {"seq": seq, "unit": unit, "window": i, "status": "ok",
                "nfba": {"intr": [500, 0, 0, 0, 0], "n_tracks": 500, "rms_inlier": 0.5, "status": 1, "sd": [1] * 5},
                "solves": {"est": {"status": 1, "intr": [520, cx, 250, 0.1, 0], "rms_px": 0.7, "sd_f": 1.0}}}
    res = {"windows": [w("fr1_desk", "fr1", 0, 300), w("fr1_desk", "fr1", 1, 310), w("fr1_xyz", "fr1", 0, 330),
                       w("fr1_xyz", "fr1", 1, 350), w("fr3_stf", "fr3", 0, 340), w("fr3_stf", "fr3", 1, 344),
                       w("fr3_stf", "fr3", 2, 352)]}
    import types
    orig = run.m3n_an.counted
    run.m3n_an.counted = lambda r: (True, "")
    try:
        p = run.priors(res)
    finally:
        run.m3n_an.counted = orig
    cx = lambda key, m: [t for t in p[key]["priors"][m] if t[0] == 1][0]
    assert cx(("fr1_desk", 0), "est_p")[1] == 330.0          # median of 310, 330, 350: itself left out
    assert cx(("fr1_desk", 0), "est_px")[1] == 340.0         # median of fr1_xyz only
    assert cx(("fr3_stf", 0), "est_p")[1] == 348.0           # Xtion pool only
    assert "est_px" not in p[("fr3_stf", 0)]["priors"]
    full, half = cx(("fr1_desk", 0), "est_p")[2], cx(("fr1_desk", 0), "est_ph")[2]
    assert full > 0 and abs(half - full / 2) < 1e-12
