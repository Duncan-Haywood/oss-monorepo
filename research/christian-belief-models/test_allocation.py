"""Checks of the milestone-6 budget-allocation helpers on synthetic data (no GSS download)."""
import importlib.util
import sys
from pathlib import Path
import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
_sp = importlib.util.spec_from_file_location('m6_alloc', HERE / 'experiments' / 'm6_allocation' / 'run.py')
al = importlib.util.module_from_spec(_sp); sys.modules['m6_alloc'] = al; _sp.loader.exec_module(al)


def test_water_fill_is_neyman_without_nstar():
    sd = np.array([1.0, 2.0, 3.0])
    n = al.water_fill(sd, np.zeros(3), 600, np.zeros(3), np.full(3, 1e9))
    assert n == pytest.approx([100, 200, 300], rel=1e-6)


def test_water_fill_zeroes_groups_the_model_already_fits():
    # a group with tiny bias has a huge break-even nstar and gets nothing
    sd, b = np.array([0.4, 0.4, 0.4]), np.array([0.10, 0.08, 0.001])
    n = al.water_fill(sd, sd ** 2 / b ** 2, 300, np.zeros(3), np.full(3, 1e9))
    assert n.sum() == pytest.approx(300)
    assert n[2] == 0 and n[0] > 0 and n[1] > 0


def test_water_fill_minimises_composite_loss():
    sd, b = np.array([0.3, 0.45, 0.5]), np.array([0.02, 0.06, 0.12])
    B = 300

    def loss(n):
        v = sd ** 2 / np.maximum(n, 1e-9)
        return float(np.sum(np.where(n > 0, b ** 2 * v / (b ** 2 + v), b ** 2)))
    best = al.water_fill(sd, sd ** 2 / b ** 2, B, np.zeros(3), np.full(3, 1e9))
    rng = np.random.default_rng(0)
    for _ in range(300):
        alt = rng.dirichlet(np.ones(3)) * B
        assert loss(best) <= loss(alt) + 1e-12


def test_water_fill_respects_bounds():
    n = al.water_fill(np.array([1.0, 5.0]), np.zeros(2), 100, np.array([20, 20]), np.array([60, 60]))
    assert n == pytest.approx([40, 60])


def test_round_alloc_sums_and_caps():
    n = al.round_alloc(np.array([10.4, 20.4, 30.2]), 61, np.array([100, 100, 100]))
    assert n.sum() == 61 and list(n) == [11, 20, 30]
    n = al.round_alloc(np.array([9.9, 0.6]), 11, np.array([10, 10]))
    assert list(n) == [10, 1]


def test_fh_gamma_limits():
    assert al.fh_gamma(0.0, 0.01) == 0
    assert al.fh_gamma(0.01, 0.0) == 1
    assert al.fh_gamma(0.01, 0.01) == pytest.approx(0.5)


def test_tau2_moments_recovers_spread():
    rng = np.random.default_rng(2)
    b = rng.normal(0, 0.05, 20000)
    v = np.full(b.size, 0.002)
    rbar = b + rng.normal(0, np.sqrt(v))
    assert al.tau2_moments(rbar, v) == pytest.approx(0.0025, rel=0.05)
    assert al.tau2_moments(np.zeros(3), np.ones(3)) == 0


def test_shrinkage_beats_difference_when_biases_are_small():
    """Groups whose concept shift is small relative to the subsample noise: the composite with the
    true tau2 has lower MSE than the unshrunk residual mean (E0 + rbar)."""
    rng = np.random.default_rng(3)
    G, R, v = 200, 400, 0.004
    b = rng.normal(0, 0.03, G)
    rbar = b[None, :] + rng.normal(0, np.sqrt(v), (R, G))
    gam = al.fh_gamma(0.03 ** 2, v)
    assert np.mean((gam * rbar - b) ** 2) < 0.5 * np.mean((rbar - b) ** 2)


def test_kish_deff():
    assert al.kish_deff(np.ones(10)) == pytest.approx(1)
    assert al.kish_deff(np.array([1.0, 3.0])) == pytest.approx(2 * 10 / 16)
