import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m6b_dfloor"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m6_floor"))
import numpy as np
from dfloor import d_floor, load
from floor import floor_gap


def test_d_floor_reduces_to_floor_at_d1_and_scales():
    assert abs(d_floor(60, 0.05, 1.0) - floor_gap(60, 0.05)) < 1e-12
    assert abs(d_floor(60, 0.05, 0.2) - 0.2 * floor_gap(60, 0.05)) < 1e-12


def test_class_membership_and_indistinguishability():
    # P1: T = 1, R = 1 - D w.p. eps stays within |R - T| <= D; data match P0 w.p. (1-eps)^m = 2 delta
    m, delta, D = 40, 0.05, 0.3
    eps = 1 - (2 * delta) ** (1 / m)
    rng = np.random.default_rng(1)
    bad = rng.random((200_000, m)) < eps
    assert abs((~bad.any(axis=1)).mean() - 2 * delta) < 0.005
    assert D <= 1.0


def test_oracle_bound_valid_on_pools():
    names, a = load()
    t = a[:, 0]
    for j in range(1, a.shape[1]):
        r = a[:, j]
        assert r.mean() >= t.mean() - np.abs(r - t).max()
