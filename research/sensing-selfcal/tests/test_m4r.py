"""Milestone 4r: the per-view focal jitter's bookkeeping (Jacobian columns, the fit of tau) on known cases."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4r_analyse", os.path.join(HERE, "..", "experiments", "m4r_jitter", "analyse.py"))
m4r = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4r)


def test_common_focal_shift_moves_every_subset_f_by_exactly_that_shift():
    """g_S . (du/df) = 1 for any subset: if every view's f moves by the same df, the subset solve's f
    moves by df (to first order). Checks the f column feeds the gains the right way round."""
    m4j = m4r.m4n.m4j_module(2)
    obs, size, _ = m4r.m4p.fresh.load("fr1")
    sols = m4r.m4p.load_sols(m4j.m4g)
    tw = m4j.twin.fit_all(obs, size, sols["_f0"]["fr1"])
    C = m4r.intr_columns(m4j, tw, (0,))[0]                 # (13, npt * 2)
    for views in ((0, 1, 2, 3, 4), (2, 5, 7, 8, 11, 12), tuple(range(13))):
        g = m4j.twin.gain(tw, list(views)).reshape(len(views), -1)
        assert abs(float((g * C[list(views)]).sum()) - 1.0) < 1e-6


def test_jitter_noise_gives_each_view_one_shared_draw():
    C = np.ones((1, 3, 4))
    E = m4r.jitter_noise(np.random.default_rng(0), C, 5).reshape(3, 4, 5)
    assert np.allclose(E, E[:, :1, :])                      # same shift on every coordinate of a view
    assert not np.allclose(E[0], E[1])


def test_fit_tau_hits_the_target_spread_and_floors_at_zero():
    rng = np.random.default_rng(1)
    Fr, Fj = rng.standard_normal((400, 300)), rng.standard_normal((400, 300))
    base = float(np.median(m4r.robust_spread(Fr)))
    t = m4r.fit_tau(Fr, Fj, 2 * base)
    assert abs(float(np.median(m4r.robust_spread(Fr + t * Fj))) / (2 * base) - 1) < 1e-6
    assert abs(t - np.sqrt(3)) < 0.15                       # two independent unit sources: sqrt(4 - 1)
    assert m4r.fit_tau(Fr, Fj, 0.5 * base) == 0.0
