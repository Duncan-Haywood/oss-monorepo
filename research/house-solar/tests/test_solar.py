import math

from house_energy.model import CLIMATES, Package
from house_solar.model import (SPLITS, SHGC, energy, evaluate, fit_temperature, solar_table, vertical_day,
                               erbs_diffuse_fraction, optimise)

CH, GAS = "Chicago (5A)", "gas furnace + AC"


def test_splits_sum_to_one():
    assert all(abs(sum(s.values()) - 1) < 1e-9 for s in SPLITS.values())


def test_temperature_fit_reproduces_degree_days():
    for hdd, cdd in CLIMATES.values():
        tm, a = fit_temperature(hdd, cdd)
        T = [tm + a * math.cos(2 * math.pi * (d - 200) / 365) for d in range(365)]
        assert abs(sum(max(65 - t, 0) for t in T) - hdd) < 1.0
        assert abs(sum(max(t - 65, 0) for t in T) - cdd) < 1.0


def test_south_beats_north_in_winter_and_not_in_summer():
    lat = 41.9
    assert vertical_day(lat, 355, 0.5, 0.0)[0] > 2 * vertical_day(lat, 355, 0.5, 180.0)[0]
    # a high summer sun shades a south wall: east and west walls get more than south on 21 June
    assert vertical_day(lat, 172, 0.5, 90.0)[0] > vertical_day(lat, 172, 0.5, 0.0)[0]


def test_east_west_symmetry():
    e, w = vertical_day(41.9, 80, 0.5, -90.0)[0], vertical_day(41.9, 80, 0.5, 90.0)[0]
    assert abs(e - w) < 1e-6 * e


def test_horizontal_total_matches_clearness_index():
    # the daily horizontal total is Kt times the extraterrestrial total, so doubling Kt doubles it
    a, b = vertical_day(40.0, 100, 0.25, 0.0)[1], vertical_day(40.0, 100, 0.5, 0.0)[1]
    assert abs(b / a - 2) < 1e-9


def test_erbs_fraction_in_range_and_continuous():
    assert all(0 < erbs_diffuse_fraction(k / 100) <= 1 for k in range(0, 90))
    assert abs(erbs_diffuse_fraction(0.1699) - erbs_diffuse_fraction(0.1701)) < 0.01


def test_solar_cuts_heating_and_adds_cooling():
    p = Package()
    sol = energy(p, CH, GAS, "south-heavy")
    assert sol["solar_heat_mmbtu"] > 0 and sol["solar_cool_mmbtu"] > 0
    zero = {u: 0.0 for u in SHGC}
    none = energy(p, CH, GAS, "south-heavy", shgc=zero)
    assert sol["heat_mmbtu"] < none["heat_mmbtu"] and sol["cool_mmbtu"] > none["cool_mmbtu"]


def test_south_glazing_helps_heating_more_than_north_in_cold_climate():
    p = Package(window_u=0.35)
    assert energy(p, CH, GAS, "south-heavy")["heat_mmbtu"] < energy(p, CH, GAS, "north-heavy")["heat_mmbtu"]


def test_table_nonnegative_and_optimum_beats_baseline():
    assert all(h >= 0 and c >= 0 for h, c in solar_table(CH).values())
    best, e = optimise(CH, GAS)
    assert e["npc"] <= evaluate(Package(), CH, GAS)["npc"]
