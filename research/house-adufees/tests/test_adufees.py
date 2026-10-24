import pytest

from house_adufees import model as m


def test_schedule_has_four_rows():
    assert len(m.schedule()) == 4


def test_house_2000_known_values():
    assert m.house_sdc(2000, "2026-01-01") == pytest.approx(3205 + 0.86 * 2000)
    assert m.house_sdc(2000, "2026-07-01") == pytest.approx(5400)


def test_over_22000_uses_lower_rate():
    assert m.house_sdc(22001) - m.house_sdc(22000) == pytest.approx(0.50)


def test_adu_flat_and_lower_than_small_house():
    assert m.adu_sdc() == 2170
    assert m.adu_sdc() < m.house_sdc(500)


def test_outside_costs_more():
    for st in m.STEPS:
        assert m.adu_sdc(st, "outside Denver") > m.adu_sdc(st)
        assert m.house_sdc(2000, st, "outside Denver") > m.house_sdc(2000, st)


def test_increase_positive_and_discount_in_range():
    assert 0 < m.step_increase("adu") < 0.2
    assert 0 < m.adu_discount(2000) < 1


def test_residual_is_sewer_sized():
    assert m.residual() == pytest.approx(16930 - 4925)


def test_sewer_components_add_up():
    s = m.sewer()
    assert s["safe_per_unit"] + s["metro_per_unit"] == s["total_per_unit"] == 6480


def test_shared_tap_cheaper_than_separate_by_unit_fee():
    assert m.sewer_permit_fees(True) - m.sewer_permit_fees(False) == 6480
    assert m.sewer_permit_fees(False) == 575


def test_adu_totals():
    assert m.adu_water_sewer_total(False) == 2170 + 575
    assert m.adu_water_sewer_total(True) == 2170 + 575 + 6480
    assert m.adu_water_sewer_total(True) < m.house_water_sewer_total()


def test_unexplained_remainder():
    assert m.unexplained_after_sewer() == pytest.approx(16930 - 4925 - 6480)
