import numpy as np
from civ_levers.history import run, summary


def test_malthusian_equilibrium_without_instability():
    # m = me = 0: dN/dt = r N (N**-0.5 - 1), fixed point N* = 1 (analytic)
    t, N, E, S, psi = run(years=3000, m=0.0, me=0.0, rho=0.0, n0=0.4)
    assert abs(N[-1] - 1.0) < 0.01


def test_logistic_like_approach():
    t, N, *_ = run(years=300, m=0.0, me=0.0, rho=0.0, n0=0.4)
    assert N[0] < N[100] < N[-1] <= 1.001


def test_summary_keys():
    s = summary(*run(years=1500))
    assert set(s) == {"psi_mean", "unrest_share", "n_min", "n_cv", "period"}


def test_zero_lags_reproduce_baseline():
    a = run(years=400, lag=0.0, plag=0.0)[1]
    b = run(years=400)[1]
    assert (a == b).all()


def test_lags_keep_equilibrium_without_instability():
    N = run(years=3000, m=0.0, me=0.0, rho=0.0, n0=0.4, lag=50, plag=50)[1]
    assert abs(N[-1] - 1.0) < 0.01


def test_collapse_off_reproduces_baseline():
    a = run(years=400, collapse_thr=None)[1]
    assert (a == run(years=400)[1]).all() and run.collapses == []


def test_collapse_fires_and_cuts_population():
    N = run(years=1500, rho=0.12, m=0.05, k=4, g=8.0, collapse_thr=0.1)[1]
    assert len(run.collapses) >= 1
    assert all(b - a >= 50 for a, b in zip(run.collapses, run.collapses[1:]))


def test_slack_elite_cap_reproduces_baseline():
    kw = dict(years=1500, rho=0.03, m=0.02, k=4, g=2.0, lag=200, plag=200, collapse_thr=0.3)
    a = run(**kw)[1]
    ca = list(run.collapses)
    b = run(elite_cap=10.0, **kw)[1]
    assert (a == b).all() and run.collapses == ca


def test_higher_tax_cuts_collapses_in_a_fiscal_cell():
    # g = 16: a costly state; the 2026-11-12 paired run found tau 0.45 cuts collapses in such cells
    kw = dict(years=2500, rho=0.03, m=0.05, k=8, g=16.0, lag=200, plag=200, collapse_thr=0.5)
    run(**kw)
    base = len(run.collapses)
    run(tau=0.45, **kw)
    assert len(run.collapses) < base
