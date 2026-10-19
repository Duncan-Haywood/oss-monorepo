import numpy as np
from garment_costperwear import *


def test_cpw_simple():
    assert cpw(100, 50) == 2.0
    assert cpw(100, 50, resale_frac=0.5) == 1.0
    assert cpw(100, 50, care_per_wear=0.3) == 2.3


def test_breakeven_matches_cpw():
    r = breakeven_ratio(2850, 56, resale_designer=0.2, care_designer=0.1, care_replica=0.1, wears_replica=60)
    assert abs(cpw(2850, r * 60, 0.2, 0.1) - cpw(56, 60, 0.0, 0.1)) < 1e-9


def test_breakeven_infinite_when_care_dominates():
    assert breakeven_ratio(1000, 50, care_designer=5.0, wears_replica=10) == float("inf")


def test_breakeven_grows_with_price():
    assert breakeven_ratio(3850, 56) > breakeven_ratio(2850, 56)


def test_resale_lowers_breakeven():
    assert breakeven_ratio(2850, 56, resale_designer=0.4) < breakeven_ratio(2850, 56)


def test_prob_monotone_in_designer_lifetime():
    ps = [prob_designer_cheaper(2850, 56, m, 60, seed=1) for m in (300, 1000, 3000, 10000)]
    assert ps == sorted(ps) and ps[0] < 0.01 and ps[-1] > 0.5


def test_prob_deterministic():
    assert prob_designer_cheaper(2850, 56, 1000, 60, seed=3) == prob_designer_cheaper(2850, 56, 1000, 60, seed=3)
