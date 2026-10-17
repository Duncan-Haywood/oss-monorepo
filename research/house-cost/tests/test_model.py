import math
import pytest
from house_cost.model import (House, PRICE_SHARES, STAGE_SHARES, STAGE_DRIVERS, REFERENCE, price, geometry,
                              per_sqft_index, vary)


def test_shares_sum_to_one():
    assert math.isclose(sum(PRICE_SHARES.values()), 1.0)
    assert math.isclose(sum(STAGE_SHARES.values()), 1.0)
    for split in STAGE_DRIVERS.values():
        assert math.isclose(sum(split.values()), 1.0)


def test_reference_reproduces_nahb_shares():
    r = price(REFERENCE)
    assert math.isclose(r["price"], 100.0)
    for k in ("construction", "lot", "profit", "overhead", "commission", "financing", "marketing"):
        assert math.isclose(r[k], 100 * PRICE_SHARES[k], rel_tol=1e-9), k
    for k, v in STAGE_SHARES.items():
        assert math.isclose(r["stages"][k], 100 * PRICE_SHARES["construction"] * v, rel_tol=1e-9)


def test_parts_sum_to_price():
    for h in (REFERENCE, vary(area=1200, storeys=1, aspect=2.5), vary(finish=1.4, lot=0.5, months=1.5)):
        r = price(h)
        assert math.isclose(sum(r[k] for k in ("construction", "lot", "overhead", "financing", "commission",
                                              "marketing", "profit")), r["price"])


def test_geometry_area_and_perimeter():
    g = geometry(House(area=2000, storeys=2, aspect=1.0))
    assert math.isclose(g["footprint"], 1000)
    assert math.isclose(g["perimeter"], 4 * 1000 ** 0.5)


def test_monotone_in_each_lever():
    base = price(REFERENCE)["price"]
    for kw in ({"area": 2400}, {"finish": 1.2}, {"foundation": 1.3}, {"lot": 1.2}, {"fees": 1.2},
               {"months": 1.2}, {"framing_labour": 1.1}, {"aspect": 2.5}):
        assert price(vary(**kw))["price"] > base, kw
    assert price(vary(framing_materials=0.8))["price"] < base


def test_bigger_house_costs_less_per_sqft():
    assert per_sqft_index(vary(area=3000)) < 100 < per_sqft_index(vary(area=1000))


def test_compact_shape_beats_long_shape():
    assert price(vary(aspect=1.0))["price"] < price(vary(aspect=3.0))["price"]


def test_two_storeys_cheaper_than_one_same_area():
    assert price(vary(storeys=2))["price"] < price(vary(storeys=1))["price"]
