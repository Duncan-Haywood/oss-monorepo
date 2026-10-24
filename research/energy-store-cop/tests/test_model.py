import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from energy_store_cop import cop_ashp, load_temp, seasonal_cop, diff, flip_multiplier, hp_energy_price  # noqa: E402
from energy_store_cop.model import CASES  # noqa: E402
from energy_store_flip.model import diff as flip_diff  # noqa: E402

WEEKLY = [c for c in CASES if c[3] == "weekly"][0]


def test_cop_matches_published_fit():
    # Staffell et al. 2012: 6.81 - 0.121*30 + 0.00063*900 = 3.747 at a 30 K lift
    assert abs(cop_ashp(5.0, 35.0) - 3.747) < 1e-9


def test_cop_falls_with_colder_source_and_hotter_sink():
    assert cop_ashp(-5, 45) < cop_ashp(5, 45) < cop_ashp(10, 45)
    assert cop_ashp(5, 55) < cop_ashp(5, 35)
    assert cop_ashp(-40, 80) >= 1.0


def test_temperature_files_are_full_years_and_plausible():
    for y in (2015, 2018):
        t = load_temp(y)
        assert len(t) == 8760 and -25 < min(t) and max(t) < 42
        assert 7 < sum(t) / len(t) < 12


def test_seasonal_cop_between_two_and_five():
    for s in (35.0, 55.0):
        assert 2.0 < seasonal_cop(2016, s) < 5.0
    assert seasonal_cop(2016, 55.0) < seasonal_cop(2016, 35.0)


def test_table_mode_reproduces_energy_store_flip():
    assert abs(diff(2016, "house", WEEKLY, mode="table") - flip_diff(2016, "house", WEEKLY)) < 1e-12


def test_colder_sink_cheaper_pump_energy():
    assert hp_energy_price(2017, 35.0) < hp_energy_price(2017, 55.0)


def test_flip_multiplier_is_a_zero():
    m = flip_multiplier(2016, "house", WEEKLY, mode="cop_hdd", t_sink=45.0)
    assert m is not None and abs(diff(2016, "house", WEEKLY, m_store=m, mode="cop_hdd")) < 1e-6
