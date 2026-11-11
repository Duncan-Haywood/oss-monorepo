import math
import pytest
from heavy_hydraulics.measured import (inlet_pressure, load_pressure, energies,
                                       pump_torque, linfit, cycle_starts,
                                       stationary_samples, percentile,
                                       moving_by_position,
                                       W_PER_BAR_LPM)


def test_inlet_pressure_picks_fed_chamber():
    assert inlet_pressure(10, 0, 150, 20) == 150
    assert inlet_pressure(0, 8, 150, 20) == 20
    assert inlet_pressure(0, 0, 150, 20) is None


def test_load_pressure_ignores_idle_sections():
    assert load_pressure([(10, 120), (0, 200), (5, 80)]) == 120
    assert load_pressure([(0, None), (0, None)]) is None


def test_ls_model_equals_measured_when_margin_is_exact():
    # pump pressure = load pressure + 25 at every step -> model == measured
    s = [(145.0, 200.0, ((20.0, 120.0), (10.0, 60.0)))] * 100
    e = energies(s, 0.01, dp_ls=25.0)
    assert e["ls_model"] == pytest.approx(e["measured"])
    assert e["useful"] == pytest.approx((20 * 120 + 10 * 60) * W_PER_BAR_LPM)
    assert e["metered"] == pytest.approx((20 * 125 + 10 * 65) * W_PER_BAR_LPM)


def test_open_centre_idle_and_moving():
    w = 2 * math.pi * 1500 / 60          # 1500 rpm
    q_fix = 63 * 1.5 - 2.5               # L/min
    idle = energies([(30.0, w, ((0.0, None),))], 1.0, dp_ls=25, p_neutral=8)
    assert idle["open_centre"] == pytest.approx(q_fix * 8 * W_PER_BAR_LPM)
    assert idle["measured"] == 0 and idle["moving_s"] == 0
    mv = energies([(150.0, w, ((40.0, 120.0),))], 1.0, dp_ls=25, dp_spool=10)
    assert mv["open_centre"] == pytest.approx(q_fix * 130 * W_PER_BAR_LPM)
    assert mv["oc_short_s"] == 0


def test_open_centre_short_pump_counted():
    w = 2 * math.pi * 800 / 60           # 800 rpm: fixed pump ~48 L/min
    e = energies([(150.0, w, ((60.0, 120.0),))], 1.0, dp_ls=25)
    assert e["oc_short_s"] == 1.0
    assert e["open_centre"] == pytest.approx(60 * 130 * W_PER_BAR_LPM)


def test_pump_torque_floor_and_ideal():
    w = 2 * math.pi * 25
    t_max = 63e-6 * 420e5 / (2 * math.pi)
    assert pump_torque(0, 0, w) == pytest.approx(0.02 * t_max)
    ideal = 63e-6 * 200e5 / (2 * math.pi)
    assert pump_torque(1, 200, w) > ideal


def test_linfit_exact_line():
    a, b, r = linfit([0, 1, 2, 3], [1, 3, 5, 7])
    assert (a, b, r) == pytest.approx((1, 2, 1))


def test_cycle_starts():
    assert cycle_starts([0, 0.2, 0.4, 0.5, 0.1, 0.35, 0.2], 0.3) == [2, 5]


def test_open_centre_q_min_treats_creep_as_neutral():
    w = 2 * math.pi * 1500 / 60
    q_fix = 63 * 1.5 - 2.5
    creep = [(30.0, w, ((0.3, 180.0),))]
    e = energies(creep, 1.0, dp_ls=25, p_neutral=8, q_min=1.0)
    assert e["open_centre"] == pytest.approx(q_fix * 8 * W_PER_BAR_LPM)
    e0 = energies(creep, 1.0, dp_ls=25, p_neutral=8, q_min=0.0)
    assert e0["open_centre"] == pytest.approx(q_fix * 190 * W_PER_BAR_LPM)


def test_open_centre_q_min_per_section():
    w = 2 * math.pi * 1500 / 60
    q_fix = 63 * 1.5 - 2.5
    # section 1 creeps under its own floor; section 2 moves above its floor
    s = [(30.0, w, ((0.8, 180.0), (3.0, 60.0)))]
    e = energies(s, 1.0, dp_ls=25, dp_spool=0, p_neutral=8, q_min=(1.0, 2.0))
    assert e["open_centre"] == pytest.approx(q_fix * 60 * W_PER_BAR_LPM)
    e2 = energies(s, 1.0, dp_ls=25, dp_spool=0, p_neutral=8, q_min=(0.5, 2.0))
    assert e2["open_centre"] == pytest.approx(q_fix * 180 * W_PER_BAR_LPM)


def test_stationary_samples_windows():
    x = [0, 0, 0.0001, 0, 0.1, 0.2, 0.3, 0.4, 0.4, 0.4, 0.4, 0.4]
    assert stationary_samples(x, 4, 0.001) == [0, 1, 2, 3, 8, 9, 10, 11]


def test_percentile_matches_linear_rule():
    assert percentile([1, 2, 3, 4], 50) == pytest.approx(2.5)
    assert percentile([5], 99) == 5
    assert percentile(list(range(101)), 99) == pytest.approx(99)


def test_moving_by_position():
    x = [0, 0, 0, 0.002, 0.004, 0.004, 0.004]
    assert moving_by_position(x, 1, 0.001) == [False, False, True, True, True, False, False]
