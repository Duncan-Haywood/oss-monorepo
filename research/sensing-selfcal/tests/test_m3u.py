"""Milestone 3u: a causal tau floor for random-effects pools (experiments/m3u_taufloor)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3u_an", os.path.join(HERE, "..", "experiments", "m3u_taufloor", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def _row(rank, f, sd_rel=0.005, model="est"):
    return {"rank": rank, "unit": "u", "seq": "s", "window": rank, model: {"f": f, "sd_rel": sd_rel}}


def test_floor_needs_five_windows_and_is_the_scatter_beyond_the_solver_sd():
    hist = [_row(i, 500.0 + d) for i, d in enumerate([-10, -5, 0, 5])]
    assert an.tau2_hist(hist, "est") is None
    hist.append(_row(4, 510.0))
    t2 = an.tau2_hist(hist, "est")
    s = 1.4826 * 5.0                      # MAD of (-10,-5,0,5,10) is 5
    assert abs(t2 - (s ** 2 - 2.5 ** 2)) < 1e-9


def test_history_uses_the_models_own_value_else_est():
    r = _row(0, 500.0); r["est_c"] = {"f": 520.0, "sd_rel": 0.001}
    assert an.value(r, "est_c")[0] == 520.0
    assert an.value(_row(1, 505.0), "est_c")[0] == 505.0


def test_floor_lifts_tau_zero_blocks_and_leaves_wide_ones():
    f, sd = [500.0, 500.1, 499.9], [1.0, 1.0, 1.0]
    mu, s, t2dl, t2 = an.floored_pool(f, sd, 25.0)
    assert t2dl == 0.0 and t2 == 25.0 and abs(s - np.sqrt(26.0 / 3)) < 1e-9
    f2 = [480.0, 500.0, 520.0]
    mu2, s2, t2dl2, t22 = an.floored_pool(f2, sd, 25.0)
    assert t2dl2 > 25.0 and t22 == t2dl2
    assert an.floored_pool(f, sd, None)[3] == 0.0


def test_floor_makes_agreeing_but_biased_blocks_honest_on_synthetic_draws():
    rng = np.random.default_rng(3)
    zr, zt = [], []
    for _ in range(2000):
        sd = np.full(3, 1.0)
        f = 500 + rng.normal(0, 5.0, 3) + rng.normal(0, sd)     # true between-window spread 5
        mu, s, _ = an.dl_pool(f, sd)
        mt, st, _, _ = an.floored_pool(f, sd, 25.0)
        zr.append((mu - 500) / s); zt.append((mt - 500) / st)
    assert np.sqrt(np.mean(np.square(zr))) > 1.3
    assert 0.8 < np.sqrt(np.mean(np.square(zt))) < 1.2
