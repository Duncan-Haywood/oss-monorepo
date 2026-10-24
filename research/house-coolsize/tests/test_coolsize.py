import pytest

import house_coolsize.model as m
from house_coolsize.model import (COMPONENTS, PACKAGES, cool_need_kbtuh, cooling_load_btuh, credit, governing,
                                  package_with, solar_gain_btuh, window_area_by_wall)
from house_hpsize.model import downsizing_credit, required_rated_kbtuh, selected_size
from house_open_design.plan_set import CLIMATE_SET


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_tight_envelope_lowers_cooling_load(c):
    assert cooling_load_btuh(PACKAGES["tight"], c) < cooling_load_btuh(PACKAGES["baseline"], c)


def test_hotter_summer_needs_more_cooling():
    assert cooling_load_btuh(PACKAGES["baseline"], "Houston (2A)") > cooling_load_btuh(PACKAGES["baseline"], "Minneapolis (6A)")


def test_solar_gain_scales_with_shgc_and_is_zero_without_it():
    assert solar_gain_btuh(0.0) == 0.0
    assert solar_gain_btuh(0.4) == pytest.approx(2 * solar_gain_btuh(0.2))


def test_window_area_matches_envelope():
    from house_open_design.analysis import envelope
    assert sum(window_area_by_wall().values()) == pytest.approx(envelope(m.PLAN, PACKAGES["baseline"])["window_ft2"])


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_governing_size_is_at_least_heating_size(c):
    for pkg in PACKAGES.values():
        assert governing(pkg, c)[0] >= selected_size(pkg, c)


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_governing_covers_both_needs(c):
    for pkg in PACKAGES.values():
        s = governing(pkg, c)[0]
        assert s >= required_rated_kbtuh(pkg, c) and s >= cool_need_kbtuh(pkg, c)


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_credit_nonnegative_for_whole_package(c):
    assert credit(COMPONENTS, c) >= 0


def test_credit_zero_when_nothing_changes():
    assert credit((), "Chicago (5A)") == 0
