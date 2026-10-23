import numpy as np
import pytest

from infra_pumpsched.sched import cost, simulate, tariff, total_kwh


@pytest.fixture(scope="module")
def shipped():
    return simulate(1, 14)


def test_shipped_window_matches_net3_controls(shipped):
    # Net3's own controls run pump 10 from 01:00 to 15:00: 14 hours on, nothing in the last 9 hours of the day
    e = shipped["kwh"]["10"]
    assert (e[1:15] > 1).all() and e[15:].max() < 1e-6 and e[0] < 1e-6


def test_mass_balance_within_two_percent(shipped):
    assert shipped["pump10_m3"] < shipped["demand_m3"]
    assert abs(shipped["drift_m3"]) < 0.01 * shipped["demand_m3"]


def test_pump_energy_matches_pump_curve(shipped):
    # head implied by kWh = rho g Q H / eta (eta 75 %, Net3's global value) vs the 3-point curve of pump 10 (EPANET fits a
    # quadratic through (0, 31.70 m), (0.1262, 28.04 m), (0.2524, 19.20 m) m3/s) at the simulated flow of ~0.208 m3/s
    q, kwh = 0.208, shipped["kwh"]["10"][5]
    implied = kwh * 3.6e6 / 3600 * 0.75 / (1000 * 9.81 * q)
    c = np.polyfit([0, 0.1261803928, 0.2523607856], [31.6992, 28.0416, 19.2024], 2)
    assert implied == pytest.approx(np.polyval(c, q), rel=0.05)


def test_24_hour_window_runs_all_day():
    r = simulate(0, 24)
    assert (r["kwh"]["10"] > 1).all()


def test_longer_window_means_less_pump_335():
    assert simulate(1, 19)["kwh"]["335"].sum() < simulate(1, 14)["kwh"]["335"].sum()


def test_tariff_shapes():
    assert tariff("flat", 5).sum() == 24
    assert tariff("evening", 3)[16:21].tolist() == [3] * 5 and tariff("evening", 3)[:16].max() == 1
    assert tariff("midday-cheap", 4)[12] == 1 and tariff("midday-cheap", 4)[18] == 4


def test_flat_cost_is_energy(shipped):
    assert cost(shipped, np.ones(24)) == pytest.approx(total_kwh(shipped))


def test_sub_hourly_step_closes_mass_balance():
    # at the 3600 s step the booster pump's mid-hour switching is sampled once an hour and supply exceeds demand by ~1 %;
    # at 900 s the gap is about the tank change (<0.2 % of demand), and the shipped energy is lower
    coarse, fine = simulate(1, 14), simulate(1, 14, step=900)
    assert abs(coarse["supply_m3"] - coarse["demand_m3"] - coarse["drift_m3"]) > 0.005 * coarse["demand_m3"]
    assert abs(fine["supply_m3"] - fine["demand_m3"] - fine["drift_m3"]) < 0.002 * fine["demand_m3"]
    assert total_kwh(fine) < 0.97 * total_kwh(coarse)
