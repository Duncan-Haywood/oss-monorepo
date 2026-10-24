import math
from infra_yield import *


def test_murphy_known_value():
    # ((1-e^-1)/1)^2
    assert abs(murphy(1.0) - 0.39957640) < 1e-7


def test_seeds_and_poisson_values():
    assert seeds(1.0) == 0.5
    assert abs(poisson(1.0) - math.exp(-1)) < 1e-12


def test_neg_binomial_tends_to_poisson():
    assert abs(neg_binomial(0.8, alpha=1e7) - poisson(0.8)) < 1e-6


def test_bose_einstein_one_layer_is_seeds_and_many_is_poisson():
    assert abs(bose_einstein(0.7, n=1) - seeds(0.7)) < 1e-12
    assert abs(bose_einstein(0.7, n=1e7) - poisson(0.7)) < 1e-6


def test_ordering_of_models_at_same_x():
    x = 1.5
    assert poisson(x) < murphy(x) < seeds(x)


def test_dies_per_wafer_known_value():
    # 100 mm2 die on a 300 mm wafer with 3 mm edge exclusion: closed form gives 6xx, exact count within 6%
    n = dies_per_wafer(100.0)
    assert 600 < n < 700
    e = dies_per_wafer_exact(10.0, 10.0, steps=8)
    assert abs(n - e) / e < 0.06


def test_cost_rises_faster_than_area():
    c1 = good_die_cost(100, 9346, 0.09)
    c4 = good_die_cost(400, 9346, 0.09)
    assert c4 > 4 * c1


def test_chiplets_lose_when_small_and_win_when_big():
    kw = dict(pkg=20.0, bond=5.0)
    assert chiplet_cost(60, 2, 9346, 0.09, **kw) > chiplet_cost(60, 1, 9346, 0.09, pkg=20.0)
    assert chiplet_cost(800, 4, 9346, 0.09, **kw) < chiplet_cost(800, 1, 9346, 0.09, pkg=20.0)


def test_breakeven_is_a_crossing():
    a = breakeven_area(2, 9346, 0.09, pkg=20.0, bond=5.0)
    assert a is not None
    kw = dict(pkg=20.0, bond=5.0)
    assert abs(chiplet_cost(a, 2, 9346, 0.09, **kw) - chiplet_cost(a, 1, 9346, 0.09, pkg=20.0)) < 0.01
