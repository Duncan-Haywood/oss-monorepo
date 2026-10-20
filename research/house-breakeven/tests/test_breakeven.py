import pytest

from house_breakeven.model import (COMPONENTS, PACKAGES, PLAN, annual_cost, annual_saving, annuity, assumed_extra_cost,
                                   breakeven_cost, package_with)
from house_energy.model import ANNUITY
from house_open_design.plan_set import CLIMATE_SET, SYSTEM_SET


def test_annuity_matches_house_energy_at_three_percent():
    assert annuity(0.03) == pytest.approx(ANNUITY)
    assert annuity(0.0) == 30.0


def test_no_change_saves_nothing():
    assert annual_saving((), "Chicago (5A)", "heat pump") == 0.0


@pytest.mark.parametrize("c", CLIMATE_SET)
@pytest.mark.parametrize("s", SYSTEM_SET)
def test_one_at_a_time_savings_add_up_to_the_whole_package(c, s):
    parts = sum(annual_saving((k,), c, s) for k in COMPONENTS)
    assert parts == pytest.approx(annual_saving(COMPONENTS, c, s), rel=1e-9)


def test_whole_package_matches_house_open_design_headline():
    # house-open-design README: $72 (Houston) to $158 (Minneapolis) a year with a heat pump
    assert round(annual_saving(COMPONENTS, "Houston (2A)", "heat pump")) == 72
    assert round(annual_saving(COMPONENTS, "Minneapolis (6A)", "heat pump")) == 158


def test_every_upgrade_saves_money_in_every_climate():
    for c in CLIMATE_SET:
        for s in SYSTEM_SET:
            for k in COMPONENTS:
                assert annual_saving((k,), c, s) > 0


def test_breakeven_is_linear_in_energy_price_and_falls_with_discount_rate():
    a = breakeven_cost(COMPONENTS, "Chicago (5A)", "heat pump", energy_mult=1.0)
    assert breakeven_cost(COMPONENTS, "Chicago (5A)", "heat pump", energy_mult=2.0) == pytest.approx(2 * a)
    r = [breakeven_cost(COMPONENTS, "Chicago (5A)", "heat pump", rate=x) for x in (0.0, 0.03, 0.07)]
    assert r[0] > r[1] > r[2] > 0


def test_colder_climates_pay_more_for_the_same_upgrade():
    b = [breakeven_cost(COMPONENTS, c, "heat pump") for c in CLIMATE_SET]
    assert b == sorted(b)


def test_package_with_only_changes_named_keys():
    p = package_with("attic_r")
    assert p["attic_r"] == 49.0 and p["window_u"] == 0.35


def test_assumed_costs_are_scaled_to_this_plan():
    assert assumed_extra_cost("wall_r") is None
    assert assumed_extra_cost("attic_r") == pytest.approx(480 * 0.035 * 19)
    assert assumed_extra_cost("ach50") == 500.0
    assert assumed_extra_cost("window_u") > 0 and PLAN.params.width * PLAN.params.depth == 480


def test_annual_cost_is_deterministic():
    x = annual_cost(PACKAGES["baseline"], "Baltimore (4A)", "gas furnace + AC")
    assert x == annual_cost(PACKAGES["baseline"], "Baltimore (4A)", "gas furnace + AC")
