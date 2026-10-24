import random

import pytest

from house_foundation import (KINDS, PRICES, Site, cheapest, cost_of, design_load_plf, draw_prices,
                              footing_width_in, mid_prices, monte_carlo, quantities)
from house_foundation.model import CONCRETE_PCF, FOOT_MIN_IN, FOOT_T_IN


def test_prices_are_ordered():
    for lo, mid, hi in PRICES.values():
        assert lo <= mid <= hi


def test_footing_has_a_floor_on_good_soil_and_grows_on_soft_soil():
    assert footing_width_in("basement", Site(bearing_psf=3000)) == FOOT_MIN_IN
    assert footing_width_in("basement", Site(bearing_psf=500)) > footing_width_in("basement", Site(bearing_psf=1000))


def test_footing_bearing_is_satisfied():
    for k in KINDS:
        for q_allow in (600, 1000, 1500, 2000):
            site = Site(bearing_psf=q_allow)
            w = footing_width_in(k, site) / 12
            pressure = design_load_plf(k) / w + CONCRETE_PCF * FOOT_T_IN / 12
            assert pressure <= q_allow + 1e-6 or w * 12 == FOOT_MIN_IN


def test_floor_and_wall_add_load():
    assert design_load_plf("slab") < design_load_plf("crawl") < design_load_plf("basement")


def test_hand_calculated_crawl_quantity():
    # 28 x 40 ft, 48 in frost: footing 16 x 8 in, stem 8 in thick, 4 + 1.5 - 2/3 ft above the footing
    q = quantities("crawl", Site(frost_in=48))
    perim, wf, t = 136.0, 16 / 12, 8 / 12
    h = 4.0 + 1.5 - t
    assert q["struct_cy"] == pytest.approx(perim * (wf * t + (8 / 12) * h) / 27)
    assert q["floor_sf"] == 1120 and q["crawl_sf"] == 1120


def test_deeper_frost_means_more_concrete_except_basement_and_fpsf():
    for k in ("slab", "crawl"):
        assert quantities(k, Site(frost_in=60))["struct_cy"] > quantities(k, Site(frost_in=30))["struct_cy"]
    for k in ("basement",):
        assert quantities(k, Site(frost_in=60)) == quantities(k, Site(frost_in=12))
    a, b = quantities("fpsf", Site(frost_in=24)), quantities("fpsf", Site(frost_in=60))
    assert a["struct_cy"] == b["struct_cy"] and b["foam_sf"] > a["foam_sf"]


def test_cost_rises_with_frost_depth_for_slab_and_crawl():
    for k in ("slab", "crawl"):
        costs = [cost_of(quantities(k, Site(frost_in=f)))[0] for f in (12, 24, 36, 48, 60)]
        assert costs == sorted(costs)


def test_basement_costs_most_and_digs_most():
    s = Site(frost_in=30)
    c = {k: cost_of(quantities(k, s))[0] for k in KINDS}
    assert max(c, key=c.get) == "basement"
    assert quantities("basement", s)["dig_cy"] > 3 * quantities("crawl", s)["dig_cy"]


def test_cheapest_returns_the_minimum():
    k, tot = cheapest(Site(frost_in=48))
    assert tot[k] == min(tot.values())


def test_draws_stay_in_range():
    rng = random.Random(1)
    for _ in range(200):
        p = draw_prices(rng)
        assert all(PRICES[n][0] <= p[n] <= PRICES[n][2] for n in PRICES)


def test_monte_carlo_is_deterministic_and_shares_sum_to_one():
    a, b = monte_carlo(Site(frost_in=48), n=300), monte_carlo(Site(frost_in=48), n=300)
    assert a == b
    assert sum(a["wins"].values()) == pytest.approx(1.0)
    lo, med, hi = a["increment_psf"]
    assert lo <= med <= hi


def test_midprice_cost_matches_expected_sum_for_slab():
    q = quantities("slab", Site(frost_in=12))
    p = mid_prices()
    expect = (q["struct_cy"] * (p["concrete"] + p["rebar"]) + q["forms_sf"] * p["forms"]
              + q["dig_cy"] * p["dig"] + q["slab_sf"] * p["slab"])
    assert cost_of(q)[0] == pytest.approx(expect)
