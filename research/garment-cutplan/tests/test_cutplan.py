import pytest
from garment_cutplan import *


def toy(n=3, G=4, per=100.0, gain=0.9):
    """Marker length per garment shrinks by `gain` when sizes are mixed; a toy, not a measurement."""
    return {k: per * sum(k) * (gain if sum(1 for v in k if v) > 1 else 1.0) for k in combos(n, G)}


def test_combo_count():
    assert len(combos(3, 4)) == 34  # 35 count tuples with 0..4 garments, minus the empty one


def test_covers_demand():
    r = plan(toy(), [7, 11, 5])
    assert all(c >= d for c, d in zip(r["cut"], [7, 11, 5]))


def test_no_mixing_gain_means_pure_is_optimal():
    L = toy(gain=1.0)
    d = [9, 14, 6]
    assert plan(L, d)["cost"] == pytest.approx(plan(L, d, allowed=pure)["cost"])


def test_mixing_gain_helps_and_never_hurts():
    L, d = toy(gain=0.9), [9, 14, 6]
    assert plan(L, d)["cost"] < plan(L, d, allowed=pure)["cost"]
    assert plan(L, d)["cost"] <= plan(L, d, allowed=pure)["cost"] + 1e-9


def test_ply_cap_binds():
    L = {(1,): 100.0}
    r = plan({(1,): 100.0, (2,): 190.0}, [120], max_plies=50)
    assert max(p for _, p in r["markers"]) <= 50


def test_setup_cost_merges_markers():
    L = {(1, 0): 100.0, (0, 1): 100.0, (1, 1): 200.0}
    d = [10, 10]
    assert len(plan(L, d, setup=0)["markers"]) >= 1
    assert len(plan(L, d, setup=1000)["markers"]) == 1  # one mixed marker saves a 1000 cm setup


def test_infeasible_returns_none():
    assert plan({(1,): 100.0}, [200], max_plies=50) is None
