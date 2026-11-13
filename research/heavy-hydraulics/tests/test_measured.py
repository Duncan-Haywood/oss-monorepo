import math
import pytest
from heavy_hydraulics.measured import (slowed_time, inlet_pressure, load_pressure, energies,
                                       pump_torque, linfit, cycle_starts,
                                       stationary_samples, percentile,
                                       moving_by_position, extra_fuel,
                                       time_ratio_from_r, breakeven_rest_rate, pump_ratio,
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


def test_slowed_time_stretches_only_short_samples():
    # 2 still, 1 within capacity, 1 at twice the pump: time 1 + 1 + 1 + 2 steps of 0.5 s
    t, share = slowed_time([(0, 10), (0, 0), (5, 10), (20, 10)], 0.5)
    assert t == pytest.approx(2.5)
    assert share == pytest.approx(0.5)
    # pumped volume over the stretched sample equals the demanded volume
    assert 10 * (2 * 0.5) == pytest.approx(20 * 0.5)
    with pytest.raises(ValueError):
        slowed_time([(1, 0)], 0.1)


def test_extra_fuel_splits_energy_and_time():
    # 3.6 MJ more hydraulic at eta 0.5 and 0.25 L/kWh -> 0.5 L; 360 s more at 5 L/h -> 0.5 L
    h, t = extra_fuel(4.6e6, 1.0e6, 1360.0, 1000.0, 0.25, 0.5, 5.0)
    assert h == pytest.approx(0.5)
    assert t == pytest.approx(0.5)
    # equal energy and time cost nothing; a faster open-centre is a credit
    assert extra_fuel(1.0, 1.0, 10.0, 10.0, 0.2, 0.8, 4.0) == (0.0, 0.0)
    assert extra_fuel(1.0, 1.0, 9.0, 10.0, 0.2, 0.8, 3.6)[1] == pytest.approx(-0.001)
    with pytest.raises(ValueError):
        extra_fuel(1, 1, 1, 1, 0.2, 0.0, 1)


def test_central_speed_uneven_steps():
    from heavy_hydraulics.measured import central_speed
    t = [0.0, 0.1, 0.3, 0.4]
    q = [0.0, 0.1, 0.3, 0.2]          # +1 rad/s, +1 rad/s, then -1 rad/s
    v = central_speed(t, q)
    assert v == pytest.approx([1.0, 1.0, 0.1 / 0.3, 1.0])
    with pytest.raises(ValueError):
        central_speed([0.0], [0.0])


def test_highest_live_skips_dead_channels():
    from heavy_hydraulics.measured import highest_live
    assert highest_live([100.0, -60.0, 250.0, 300.0], [0, 1, 2]) == 250.0
    with pytest.raises(ValueError):
        highest_live([1.0], [])


def test_cylinder_flow_cap_and_annulus():
    import math
    from heavy_hydraulics.measured import cylinder_flow
    # 110 x 75 boom, 0.5 m/rad lever, 0.2 rad/s: rod speed 0.1 m/s
    cap = math.pi * 0.11 ** 2 / 4
    ann = cap - math.pi * 0.075 ** 2 / 4
    assert cylinder_flow(0.2, 0.5, 0.11, 0.075, 1) == pytest.approx(cap * 0.1 * 60000)
    assert cylinder_flow(-0.2, 0.5, 0.11, 0.075, 1) == pytest.approx(ann * 0.1 * 60000)
    assert cylinder_flow(-0.2, 0.5, 0.11, 0.075, -1) == pytest.approx(cap * 0.1 * 60000)
    assert cylinder_flow(0.0, 0.5, 0.11, 0.075, 1) == 0.0
    with pytest.raises(ValueError):
        cylinder_flow(0.1, 0.5, 0.07, 0.075, 1)


def test_pump_ratio_identity_and_inverse():
    from heavy_hydraulics.measured import pump_ratio, pump_for_ratio
    q = [0.0, 10.0, 20.0, 30.0]
    # pump 15: max(15, q) = 15, 15, 20, 30 -> 80 / 60
    assert pump_ratio(q, 15.0) == pytest.approx(80 / 60)
    # matches 5w's slowed time times pump flow over demand volume
    t, _ = slowed_time([(x, 15.0) for x in q], 1.0)
    assert 15.0 * t / sum(q) == pytest.approx(pump_ratio(q, 15.0))
    # scale-free, tends to 1, inverse recovers the pump
    assert pump_ratio([2 * x for x in q], 30.0) == pytest.approx(pump_ratio(q, 15.0))
    assert pump_ratio(q, 0.0) == pytest.approx(1.0)
    assert pump_for_ratio(q, 80 / 60) == pytest.approx(15.0, rel=1e-6)
    assert pump_for_ratio(q, 2.0) == pytest.approx(30.0)   # above peak: 2 x mean 15
    with pytest.raises(ValueError):
        pump_for_ratio(q, 0.9)


def test_time_ratio_from_r_matches_slowed_record():
    # direct: each sample lasts max(1, q / q_p) dt; still samples (q 0) last dt
    dem = [0.0, 0.0, 40.0, 80.0, 150.0, 260.0, 90.0, 30.0]
    mv = [q for q in dem if q > 0]
    def t(qp):
        return sum(max(1.0, q / qp) for q in dem)
    mu, phi = sum(mv) / len(mv), (len(dem) - len(mv)) / len(mv)
    for qp in (35.0, 100.0, 180.0):
        tau = time_ratio_from_r(pump_ratio(mv, qp), qp, pump_ratio(mv, 219.0), 219.0, mu, phi)
        assert tau == pytest.approx(t(qp) / t(219.0))


def test_breakeven_rest_rate_zeroes_the_fuel_gap():
    f = breakeven_rest_rate(20.0, 8.0, 98.0, 1.23, 0.2332, 0.818)
    gap = 0.2332 * (8.0 - 20.0) * 98.0 / (600 * 0.818) + f * 0.23
    assert gap == pytest.approx(0.0, abs=1e-12)
    assert breakeven_rest_rate(20.0, 25.0, 98.0, 1.1, 0.2332, 0.818) is None
    assert breakeven_rest_rate(20.0, 8.0, 98.0, 1.0, 0.2332, 0.818) is None


def test_geometry_breakeven_table_matches_results():
    """6c: the committed 384-case table agrees with the results file it was written with."""
    import csv
    import os
    import re
    import statistics
    here = os.path.join(os.path.dirname(__file__), "..", "experiments")
    with open(os.path.join(here, "excavator_breakeven_geometry_cases.csv")) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 384
    assert len({(r["boom_lever"], r["arm_lever"], r["bucket_lever"], r["bucket_sign"], r["swing_share"]) for r in rows}) == 384
    text = open(os.path.join(here, "excavator_breakeven_geometry_results.txt")).read()
    med = float(re.search(r"central parameters: f_t,max min [\d.]+, p10 [\d.]+, median ([\d.]+)", text).group(1))
    fs = [float(r["ft_max_central_lph"]) for r in rows]
    assert abs(statistics.median(fs) - med) < 0.006
    cen = next(r for r in rows if (r["boom_lever"], r["arm_lever"], r["bucket_lever"], r["bucket_sign"], r["swing_share"])
               == ("1", "1", "1", "1", "0.5"))
    assert abs(float(cen["ft_max_central_lph"]) - 2.462) < 0.001
    for r in rows:     # each case's central value lies inside its own 108-point sweep
        assert float(r["ft_max_sweep_min_lph"]) <= float(r["ft_max_central_lph"]) <= float(r["ft_max_sweep_max_lph"])
