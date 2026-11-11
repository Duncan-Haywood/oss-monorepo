"""Milestone 6p: the wave-glider foil model's analytic properties and its fast inversion."""
import math
import statistics

from marine_hull.waveglider import Foils, Table, heave_velocity, speed


def test_heave_velocity_matches_spectral_moment():
    # w is d(eta)/dt, so its variance is (2 pi)^2 m2; for JONSWAP with gamma 3.3, sqrt(m2/m0) is near 1/(0.8 Tp).
    w = heave_velocity(10.0, hs=2.0, duration=1800.0)
    rms = statistics.pstdev(w)
    approx = 2 * math.pi * (2.0 / 4.0) / (0.8 * 10.0)
    assert 0.7 * approx < rms < 1.3 * approx


def test_no_heave_no_thrust():
    f = Foils()
    assert f.thrust(0.5, [0.0] * 50) < 0      # only profile drag
    assert speed(5.0, [0.0] * 50, f) == 0.0


def test_inflow_below_stop_gives_no_lift():
    f = Foils(theta_stop=30.0, cd0=0.0)
    # phi = atan(0.1 / 1.0) = 5.7 deg < 30 deg, so alpha = 0, C_L = 0, and with C_D0 = 0 the force is exactly 0
    assert f.thrust(1.0, [0.1, -0.1]) == 0.0


def test_speed_scales_linearly_with_wave_height():
    f = Foils()
    w1 = heave_velocity(8.0, hs=1.0)
    w2 = heave_velocity(8.0, hs=2.0)
    assert abs(speed(2.0, w2, f) / speed(2.0, w1, f) - 2.0) < 1e-3


def test_speed_rises_with_r_and_falls_with_period():
    t = Table(tps=[6.0, 8.0, 10.0, 12.0], duration=300.0)
    assert t.speed(1.0, 1.0, 8.0) < t.speed(4.0, 1.0, 8.0)
    assert t.speed(2.0, 1.0, 12.0) < t.speed(2.0, 1.0, 6.0)


def test_table_inversion_agrees_with_bisection():
    tps = [8.0, 9.0]
    t = Table(tps=tps, duration=300.0)
    w = heave_velocity(8.0, duration=300.0)
    for r in (0.5, 2.0, 5.0):
        exact = speed(r, w, t.foils)
        assert abs(t.speed(r, 1.0, 8.0) - exact) < 0.01 * exact + 1e-3
