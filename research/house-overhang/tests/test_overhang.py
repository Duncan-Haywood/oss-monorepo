import math

from house_energy.model import baseline
from house_overhang.model import (OVERHANG_COST, PROJECTIONS, WIN_H, evaluate, optimise, shaded_fraction,
                                  solar_table_shaded, vertical_day_shaded)
from house_solar.model import vertical_day

GAS = "gas furnace + AC"


def test_no_projection_no_shade():
    assert shaded_fraction(0.0, 1.0, 0.0) == 0.0


def test_shade_grows_with_projection_and_sun_height():
    lo, hi = math.radians(25), math.radians(70)
    assert shaded_fraction(1, lo, 0) <= shaded_fraction(2, lo, 0) <= shaded_fraction(4, lo, 0)
    assert shaded_fraction(2, lo, 0) < shaded_fraction(2, hi, 0)


def test_shaded_fraction_closed_form_at_noon():
    # sun due south at 45 degrees: shadow depth is P - offset
    assert abs(shaded_fraction(2.0, math.pi / 4, 0.0, h=4.0, offset=0.5) - 1.5 / 4.0) < 1e-12
    assert shaded_fraction(10.0, math.pi / 4, 0.0) == 1.0


def test_sun_behind_the_wall_casts_no_shade():
    assert shaded_fraction(3.0, 0.5, math.pi) == 0.0


def test_zero_projection_matches_house_solar():
    for n in (80, 172, 355):
        assert abs(vertical_day_shaded(41.9, n, 0.5, 0.0, 0.0) - vertical_day(41.9, n, 0.5, 0.0)[0]) < 1e-6


def test_overhang_only_reduces_south_radiation():
    for pr in PROJECTIONS[1:]:
        assert vertical_day_shaded(41.9, 172, 0.5, 0.0, pr) < vertical_day(41.9, 172, 0.5, 0.0)[0]
    assert solar_table_shaded("Chicago (5A)", 2.0)["N"] == solar_table_shaded("Chicago (5A)", 0.0)["N"]


def test_summer_shade_exceeds_winter_shade():
    d = lambda n: 1 - vertical_day_shaded(41.9, n, 0.5, 0.0, 2.0) / vertical_day(41.9, n, 0.5, 0.0)[0]
    assert d(172) > d(355)


def test_overhang_cost_is_linear_in_projection():
    c = lambda pr: evaluate(baseline(), "Chicago (5A)", GAS, "south-heavy", pr)["overhang_cost"]
    assert c(0.0) == 0 and abs(c(4.0) - 2 * c(2.0)) < 1e-9 and c(1.0) > 0


def test_free_overhang_helps_in_miami_and_free_choice_never_worse():
    free = lambda c, pr: evaluate(baseline(), c, GAS, "south-heavy", pr)["annual_cost"]
    assert free("Miami (1A)", 4.0) < free("Miami (1A)", 0.0)
    b, pr, e = optimise("Chicago (5A)", GAS)
    assert e["npc"] <= evaluate(b, "Chicago (5A)", GAS, "south-heavy", 0.0)["npc"]
