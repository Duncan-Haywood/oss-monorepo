import pytest

from energy_store_modelprice import price_sources, executed_cheapest_mean, case_costs, verdict, CASES, YEARS


def test_executed_equals_plain_when_plan_is_actual():
    actual = [5.0, 1.0, 4.0, 2.0, 3.0, 9.0, 0.0, 7.0]
    assert executed_cheapest_mean(actual, actual, 2, 0.5) == pytest.approx((1 + 2 + 0 + 3) / 4)


def test_executed_pays_actual_not_planned_price():
    plan = [1.0, 2.0, 3.0, 4.0]       # picks the first hour of the single window
    actual = [10.0, 0.0, 0.0, 0.0]
    assert executed_cheapest_mean(plan, actual, 1, 0.25) == pytest.approx(10.0)


def test_verdict_bands():
    assert verdict(0.01, 0.02) == "store" and verdict(0.03, 0.02) == "pump" and verdict(0.0205, 0.02) == "tie"


def test_sources_have_8760_hours_and_oracle_matches_real_mean():
    s = price_sources(2019)
    assert all(len(v) == 8760 for v in s.values())
    assert sum(s["resid+"]) / 8760 == pytest.approx(sum(s["real"]) / 8760)
    assert max(s["merit"]) == min(s["merit"])


def test_store_cost_rises_with_price_and_heat_pump_is_independent_of_it():
    a = case_costs(0.02, 0.04, "house", CASES[0])
    b = case_costs(0.05, 0.04, "house", CASES[0])
    assert b[0] > a[0] and b[1] == pytest.approx(a[1])


def test_real_verdict_reproduces_energy_thermal_real_headline():
    # energy-thermal-real: house daily store beats the pump in all five years (diff -0.012 to -0.027)
    from energy_thermal_hourly import cheapest_mean, heating_season_mean, load_year
    for y in YEARS:
        real = price_sources(y)["real"]
        st, hp = case_costs(cheapest_mean(real, 365, .25), heating_season_mean(real, load_year(y)), "house", CASES[0])
        assert -0.028 < st - hp < -0.011


def test_residual_fit_never_sees_the_held_out_year(monkeypatch):
    # The study rests on leave-one-year-out: the fit for a test year must be
    # trained on the other years only (quality audit round 69: a mutant that
    # trained on all five years left every other test green).
    import energy_store_modelprice.model as m
    seen = {}
    real_fit = m.isotonic_fit

    def spy(xs, ys):
        seen["n"] = len(xs)
        return real_fit(xs, ys)

    monkeypatch.setattr(m, "isotonic_fit", spy)
    m.price_sources(2019)
    others = sum(len(m.load_year_rows(y)) for y in m.YEARS if y != 2019)
    assert seen["n"] == others
