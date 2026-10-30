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
