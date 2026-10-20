import pytest

import house_hpsize.model as m
from house_hpsize.model import (COMPONENTS, COSTED, PACKAGES, costed_extra, design_load_btuh, downsizing_credit,
                                equipment_cost, package_with, required_rated_kbtuh, selected_size, total_breakeven)
from house_breakeven.model import breakeven_cost
from house_open_design.plan_set import CLIMATE_SET


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_tight_envelope_has_lower_design_load(c):
    assert design_load_btuh(PACKAGES["tight"], c) < design_load_btuh(PACKAGES["baseline"], c)


def test_colder_climate_needs_more_capacity():
    loads = [required_rated_kbtuh(PACKAGES["baseline"], c) for c in CLIMATE_SET]
    assert loads == sorted(loads)


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_selected_size_covers_requirement_and_is_smallest(c):
    for pkg in PACKAGES.values():
        s, need = selected_size(pkg, c), required_rated_kbtuh(pkg, c)
        assert s >= need
        smaller = [x for x in m.SIZES_KBTUH if x < s]
        assert not smaller or smaller[-1] < need


@pytest.mark.parametrize("c", CLIMATE_SET)
def test_credit_is_never_negative_and_matches_catalogue_step(c):
    for k in COMPONENTS:
        assert downsizing_credit((k,), c) >= 0
    exp = equipment_cost(selected_size(PACKAGES["baseline"], c)) - equipment_cost(selected_size(PACKAGES["tight"], c))
    assert downsizing_credit(COMPONENTS, c) == pytest.approx(exp)


def test_no_change_gives_no_credit():
    assert downsizing_credit((), "Chicago (5A)") == 0


def test_credit_is_a_step_not_additive():
    # Chicago: only the wall moves the size down alone; the other upgrades alone change nothing.
    c = "Chicago (5A)"
    alone = sum(downsizing_credit((k,), c) for k in COMPONENTS)
    assert alone == downsizing_credit(("wall_r",), c)
    assert downsizing_credit(COMPONENTS, c) == pytest.approx(alone)


def test_total_adds_energy_and_credit():
    c = "Baltimore (4A)"
    assert total_breakeven(COSTED, c) == pytest.approx(breakeven_cost(COSTED, c, "heat pump") + downsizing_credit(COSTED, c))


def test_costed_extra_matches_house_breakeven_headline():
    assert round(costed_extra()) == 2211


def test_more_oversize_never_shrinks_the_selection():
    c = "Chicago (5A)"
    old = m.OVERSIZE
    try:
        sizes = []
        for ov in (1.0, 1.15, 1.3, 1.5):
            m.OVERSIZE = ov
            sizes.append(selected_size(PACKAGES["baseline"], c))
        assert sizes == sorted(sizes)
    finally:
        m.OVERSIZE = old
