import pytest
from garment_teardown import *


def test_breakdown_sums():
    b = cost_breakdown(TRENCH, SCENARIOS["mid-wage"])
    direct = b["fabric"] + b["lining"] + b["trims"] + b["labour"]
    assert b["fob"] == pytest.approx(direct + b["overhead_profit"])
    assert b["retail"] == pytest.approx(b["fob"] + b["brand_margin"] + b["retail_margin"])


def test_labour_formula():
    g = TRENCH
    s = SCENARIOS["high-wage"]
    expect = (g.sam_minutes + g.cutting_finishing_minutes) / 60 * s.wage_per_hour / s.line_efficiency
    assert cost_breakdown(g, s)["labour"] == pytest.approx(expect)


def test_wage_monotone():
    p = [retail_price(TRENCH, SCENARIOS[k]) for k in ("low-wage", "mid-wage", "high-wage")]
    assert p[0] < p[1] < p[2]


def test_fabric_used_exceeds_pieces():
    assert TRENCH.fabric_used_m2() > TRENCH.piece_area_m2


def test_replica_cheaper_and_no_markups():
    r = replica(TRENCH)
    assert r.brand_multiplier == 1 and r.retail_multiplier == 1
    s = SCENARIOS["mid-wage"]
    assert retail_price(r, s) < cost_breakdown(TRENCH, s)["fob"]


def test_mc_ordered_and_reproducible():
    a = monte_carlo(TRENCH, SCENARIOS["mid-wage"], n=300, seed=1)
    b = monte_carlo(TRENCH, SCENARIOS["mid-wage"], n=300, seed=1)
    assert a == b and a["fob"][0] < a["fob"][1] < a["fob"][2]


def test_implied_markup_inverse():
    s = SCENARIOS["mid-wage"]
    fob = cost_breakdown(TRENCH, s)["fob"]
    assert implied_markup(TRENCH, s, 10 * fob) == pytest.approx(10)
