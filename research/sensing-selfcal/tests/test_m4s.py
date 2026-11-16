"""Milestone 4s: pool C is disjoint from pools A and B and keeps its 0.5 s gap; C's pick rule removes
frames near either excluded frame; the borrowed-tau stand-in returns the tau milestone 4r's pool_twin
expects; third.load leaves A and B as milestone 4p loads them."""
import importlib.util, os, sys
import numpy as np

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4s_third")
sys.path.insert(0, EXP)
import third  # noqa: E402

_pspec = importlib.util.spec_from_file_location("m4s_prepare", os.path.join(EXP, "prepare.py"))
prep = importlib.util.module_from_spec(_pspec)
_pspec.loader.exec_module(prep)


def _times(names):
    return np.array([float(n[:-4]) for n in names])


def test_third_pool_is_disjoint_and_keeps_the_gap():
    for u in third.tu.UNITS:
        _, _, a = third.load(u)
        _, _, b = third.load(u + "b")
        obs, size, c = third.load(u + "c")
        assert obs.shape == (13, third.tu.NPT, 2) and not set(c) & (set(a) | set(b))
        tc = _times(c)
        assert np.all(np.abs(tc - _times(a)) > prep.GAP) and np.all(np.abs(tc - _times(b)) > prep.GAP)
        assert np.all(np.diff(tc) > 0)


def test_load_of_a_and_b_is_milestone_4p_s():
    for u in ("fr1", "fr1b"):
        x, y = third.load(u), third._load_ab(u)
        assert np.array_equal(x[0], y[0]) and x[2] == y[2]


def test_pick_c_excludes_both_frames():
    block = [dict(t=i / 10, sharp=1.0, tilt=t) for i, t in enumerate((0.9, 0.1, 0.2, 0.8, 0.3, 0.1, 0.2, 0.7, 0.1, 0.2, 0.3))]
    r, n = prep.pick_c(block, (0.0, 1.0))         # no frame is more than 0.5 s from both
    assert r is None and n == 0
    r, n = prep.pick_c(block, (0.0, 0.1))         # keeps t = 0.7 .. 1.0
    assert n == 4 and r["t"] == 0.7


def test_fixed_tau_returns_the_share_of_f_in_rms_units():
    spec = importlib.util.spec_from_file_location("m4s_analyse_t", os.path.join(EXP, "analyse.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    f13, rms, real, tau_rel = 530.0, 0.8, 0.012, 0.009
    target = real * f13 / rms                     # what milestone 4r's pool_twin passes to fit_tau
    tau = m.fixed_tau(tau_rel, real)(None, None, target)
    assert abs(tau * rms / f13 - tau_rel) < 1e-12
