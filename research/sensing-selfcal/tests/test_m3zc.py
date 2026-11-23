"""Milestone 3zc: a bias-corrected distortion gate (experiments/m3zc_biasgate)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3zc_an", os.path.join(HERE, "..", "experiments", "m3zc_biasgate", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)

HELD = {"f": 500.0, "k1": 0.2, "k2": -0.5, "k3": 0.3}


def _pool(dD, **kw):
    p = {"f": 500.5, "sd": 4.0, "k1": 0.1, "k2": -0.2, "D": an.d200(HELD) + dD, "sdD": 1.0,
         "beta": {"louo": -1.5, "loso": -0.2}, "histD": an.d200(HELD) - 1.5}
    p.update(kw)
    return p


def test_correction_moves_the_test_not_the_estimate():
    # pool 1.5 px low: the uncorrected gate fires, the louo gate (beta -1.5) does not, loso (beta -0.2) does
    p = _pool(-1.5)
    assert an.updated("two_gates", p, HELD)["k1"] == 0.1
    assert an.updated("two_gates_louo", p, HELD) == HELD
    u = an.updated("two_gates_loso", p, HELD)
    assert u == {"f": 500.0, "k1": 0.1, "k2": -0.2, "k3": 0.0}   # adopted uncorrected, k3 dropped
    # f gate unchanged: f far fires regardless of the distortion gate
    assert an.updated("two_gates_louo", _pool(-1.5, f=520.0), HELD)["f"] == 520.0


def test_commissioning_gate_is_a_change_detector():
    comm = dict(HELD)
    # history 1.5 px low against commissioning; pool also 1.5 px low: no change, no fire
    assert an.updated("two_gates_comm", _pool(-1.5), HELD, comm) == HELD
    # pool 4 px low (2.5 px more than at commissioning): fires
    assert an.updated("two_gates_comm", _pool(-4.0), HELD, comm)["k1"] == 0.1
    # no history: no gate
    assert an.updated("two_gates_comm", _pool(-4.0, histD=None), HELD, comm) == HELD


def test_fleet_betas_leave_out():
    board = {"a": {"f": 500.0, "k1": 0.1, "k2": 0.0}, "b": {"f": 500.0, "k1": 0.0, "k2": 0.0}}
    mk = lambda seq, unit, dk: {"seq": seq, "unit": unit, "est_c": {"f": 500.0, "k1": board[unit]["k1"] + dk, "k2": 0.0}}
    S = [mk("a1", "a", -0.01), mk("a2", "a", -0.03), mk("b1", "b", 0.02)]
    be = an.fleet_betas(S, "est_c", board)
    one = an.d200({"f": 500.0, "k1": 0.01, "k2": 0.0})      # D200 is linear in k1 at fixed f
    assert np.isclose(be["a1"]["louo"], 2 * one) and np.isclose(be["b1"]["louo"], -2 * one)
    assert np.isclose(be["a1"]["loso"], np.median([-3 * one, 2 * one]))
    assert np.isclose(be["a1"]["own"], -one)
