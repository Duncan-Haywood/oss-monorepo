import csv

import pytest

from house_market import (PRICE_PARTS, STAGES, TECHNIQUES, denver_house, load_facts, load_sources,
                          price_breakdown, reach, reconcile, small_home, split_house, stage_breakdown)
from house_market.model import DATA

F = load_facts()


def test_every_fact_has_a_known_source():
    sources = load_sources()
    with open(DATA / "facts.csv", newline="") as fh:
        for row in csv.DictReader(fh):
            assert row["source"] in sources, row["key"]
            assert row["period"], row["key"]
    for t in TECHNIQUES:
        assert t[4] in sources


def test_nahb_parts_add_up_to_the_published_price():
    assert sum(F["nahb_" + p] for p in PRICE_PARTS) == pytest.approx(F["nahb_price"], abs=2)
    assert sum(F["stage_" + s] for s in STAGES) == pytest.approx(F["nahb_construction"], abs=2)


def test_published_shares_are_reproduced():
    shares = {n: s for n, _, s, _ in price_breakdown(F)}
    assert shares["construction"] == pytest.approx(0.644, abs=5e-4)
    assert shares["lot"] == pytest.approx(0.137, abs=5e-4)
    stages = {n: sc for n, _, sc, _, _ in stage_breakdown(F)}
    assert stages["framing"] == pytest.approx(0.166, abs=5e-4)
    assert stages["interior"] == pytest.approx(0.241, abs=5e-4)


def test_nahb_construction_cost_per_sq_ft_matches_the_report():
    assert reconcile(F)["nahb_construction_ppsf"] == pytest.approx(162, abs=0.5)


def test_split_house_conserves_price():
    h = split_house(F, 150.0, 2000)
    assert sum(h[p] for p in PRICE_PARTS if p != "lot") == pytest.approx(300000, rel=1e-4)
    assert sum(h["stage_" + s] for s in STAGES) == pytest.approx(h["construction"], rel=1e-4)


def test_denver_parts_add_up_and_only_area_fees_scale():
    d = denver_house(F)
    assert d["hard"] + d["fees"] + d["delay"] + d["soft"] == pytest.approx(d["price_ex_lot"])
    assert d["fees"] == pytest.approx(16930 + 16360 + 4510 + 7686)
    assert denver_house(F, 1000)["fees"] == pytest.approx(16930 + 4510 + (16360 + 7686) / 2)
    assert d["fee_share"] > d["national_fee_share"]


def test_reach_is_linear_and_bounded():
    assert reach(F, 0.2) == pytest.approx(2 * reach(F, 0.1))
    assert reach(F, 1.0, STAGES) == pytest.approx(F["nahb_construction"] / F["nahb_price"], rel=1e-4)


def test_small_home_benchmarks_are_ordered():
    costs = [usd for _, _, usd in small_home(F)]
    assert costs == sorted(costs)


def test_technique_ranges_are_ordered():
    for name, lo, hi, *_ in TECHNIQUES:
        assert (lo is None) == (hi is None), name
        if lo is not None:
            assert 0 < lo <= hi, name
