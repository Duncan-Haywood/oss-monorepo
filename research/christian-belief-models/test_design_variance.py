"""Checks of the milestone-6 design-based (strata and PSU) variance on synthetic data (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_dv', HERE / 'experiments' / 'm6_design_variance' / 'run.py')
dv = importlib.util.module_from_spec(_sp); sys.modules['m6_dv'] = dv; _sp.loader.exec_module(dv)


def test_each_row_its_own_psu_gives_kish_variance():
    rng = np.random.default_rng(0)
    x, w = (rng.random(300) < 0.4).astype(float), rng.uniform(0.5, 2.0, 300)
    strat, psu = dv.design_keys(np.full(300, 1972.0), np.full(300, np.nan), np.full(300, np.nan),
                                np.arange(300))
    ps, nh = dv.psu_strata(strat, psu)
    assert nh.tolist() == [300]
    v = dv.ultimate_cluster_var(dv.lin_mean(x, w), psu, ps, nh)
    assert v == pytest.approx(dv.kish_var(x, w))


def test_design_keys_separate_years_and_fill_missing():
    strat, psu = dv.design_keys(np.array([2000., 2000, 2002, 1972, 1972]), np.array([5., 5, 5, np.nan, np.nan]),
                                np.array([1., 2, 1, np.nan, np.nan]), np.array([1, 2, 1, 1, 2]))
    assert strat[0] == strat[1] != strat[2]          # same vstrat code, different year: different strata
    assert len(set(psu.tolist())) == 5               # every row its own PSU here
    assert strat[3] == strat[4]


def test_empty_psus_of_a_domain_still_count():
    # Two strata, two PSUs each; the domain sits only in PSU 0 of stratum 0. PSU 1 (U = 0) must count.
    psu, ps, nh = np.array([0, 0]), np.array([0, 0, 1, 1]), np.array([2, 2])
    u = np.array([0.3, 0.2])
    assert dv.ultimate_cluster_var(u, psu, ps, nh) == pytest.approx(2 * ((0.5 - 0.25) ** 2 + (0 - 0.25) ** 2))


def test_ultimate_cluster_variance_matches_monte_carlo_for_clustered_sample():
    """Paired-PSU design with a cluster random effect: the estimator's mean over replicates is close
    to the empirical variance of the weighted share, and well above the Kish variance."""
    rng = np.random.default_rng(3)
    H, m = 60, 20   # strata, respondents per PSU
    est, vd, vk = [], [], []
    strat = np.repeat(np.arange(H), 2 * m)
    psu = np.repeat(np.arange(2 * H), m)
    ps, nh = dv.psu_strata(strat, psu)
    for _ in range(400):
        eff = np.repeat(rng.normal(0, 0.8, 2 * H), m)
        x = (rng.random(2 * H * m) < 1 / (1 + np.exp(-eff))).astype(float)
        w = rng.uniform(0.5, 2.0, len(x))
        est.append(np.average(x, weights=w))
        vd.append(dv.ultimate_cluster_var(dv.lin_mean(x, w), psu, ps, nh))
        vk.append(dv.kish_var(x, w))
    emp = np.var(est)
    assert np.mean(vd) == pytest.approx(emp, rel=0.2)
    assert np.mean(vd) > 1.5 * np.mean(vk)
