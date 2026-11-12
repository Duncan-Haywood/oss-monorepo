import importlib.util
import math
import random
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parents[1] / "experiments" / "mfbo"
spec = importlib.util.spec_from_file_location("mfbo_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_cokriging_interpolates_high_observations():
    rng = np.random.default_rng(0)
    X = rng.random((20, 4))
    yl = X.sum(1)
    yh = 0.5 * yl + 0.1 * np.sin(3 * X[:, 0])
    ck = run.CoKrig().fit(X, yl, X[:8], yh[:8])
    mu, sdh, sdl, corr = ck.predict(X[:8])
    assert np.allclose(mu, yh[:8], atol=1e-2)
    assert (sdh < 0.05).all() and (sdl < 0.05).all()


def test_cokriging_uses_the_low_rung():
    """With f_h an affine map of f_l, 3 high points plus dense low data predict f_h far better than a GP on the 3."""
    rng = np.random.default_rng(1)
    X = rng.random((60, 4))
    yl = np.sin(3 * X[:, 0]) + X[:, 1] ** 2
    yh = 0.6 * yl + 2.0
    ck = run.CoKrig().fit(X, yl, X[:3], yh[:3])
    mu, *_ = ck.predict(X[3:])
    mu_gp, _ = run.S.gp_fit_predict(X[:3], yh[:3], X[3:])
    e_ck = np.sqrt(np.mean((mu - yh[3:]) ** 2))
    e_gp = np.sqrt(np.mean((mu_gp - yh[3:]) ** 2))
    assert e_ck < 0.5 * e_gp


def test_posterior_correlation_is_a_correlation():
    rng = np.random.default_rng(2)
    X = rng.random((15, 4))
    ck = run.CoKrig().fit(X[:10], X[:10].sum(1), X[:4], 2 * X[:4].sum(1))
    _, sdh, sdl, corr = ck.predict(rng.random((30, 4)))
    assert (corr >= -1).all() and (corr <= 1).all() and (sdh > 0).all() and (sdl > 0).all()


def toy():
    n = 12
    rng = random.Random(0)
    u = [[rng.random() for _ in range(4)] for _ in range(n)]
    target = [100 + 50 * x[0] - 20 * x[1] for x in u]
    low = [1.1 * t + 3 for t in target]
    sc = {run.HI: target, ("SPM", 2): low, ("DFN", 2): low, ("SPM", 100): low}
    cost = {run.HI: 20.0, ("SPM", 2): 0.5, ("DFN", 2): 1.0, ("SPM", 100): 1.0}
    return dict(target=target, sc=sc, cost=cost, u=u, n=n)


def test_every_method_reaches_the_target_and_charges_correctly():
    D = toy()
    pool = list(range(D["n"]))
    thr = 0.99 * max(D["target"])
    cf = lambda c, i: D["cost"][c]  # noqa: E731
    for m in run.METHODS:
        tr = run.run_method(m, pool, D, cf, thr, 0)
        assert tr.best >= thr, m
        t = run.S.t_hit(tr.pts, thr)
        assert math.isfinite(t)
        lo_cells = {"SPM@2": 0.5, "DFN@2": 1.0, "SPM@100": 1.0}
        c_lo = next((v for k, v in lo_cells.items() if m.endswith(k)), 0.0)
        assert abs(tr.t - (tr.n_hi * 20.0 + tr.n_lo * c_lo)) < 1e-9, m
        assert tr.n_hi >= 1


def test_screen_with_a_perfect_ranker_needs_one_dfn_call():
    D = toy()
    pool = list(range(D["n"]))
    thr = 0.99 * max(D["target"])
    tr = run.m_screen(pool, D, ("SPM", 2), lambda c, i: D["cost"][c], thr)
    assert tr.n_hi == 1 and tr.n_lo == D["n"]
    assert tr.t == D["n"] * 0.5 + 20.0


def test_per_design_cost_scales_by_the_designs_own_time():
    D = dict(cost={run.HI: 20.0, ("SPM", 2): 0.5})
    cf = run.cost_fns(D, {"DFN": [10.0, 20.0, 40.0], "SPM": [1.0, 1.0, 1.0]})
    assert cf["A"](run.HI, 2) == 20.0
    assert cf["B"](run.HI, 0) == 10.0 and cf["B"](run.HI, 2) == 40.0
    assert cf["B"](("SPM", 2), 1) == 0.5


def test_spearman():
    assert run.spearman([1, 2, 3], [10, 20, 30]) == 1.0
    assert run.spearman([1, 2, 3], [3, 2, 1]) == -1.0
