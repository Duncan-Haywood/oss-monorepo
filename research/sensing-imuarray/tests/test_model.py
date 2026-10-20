import math
import numpy as np
import pytest
from sensing_imuarray import (Grade, angle_var, fused_factor, fused_angle_var, better_grade,
                              breakeven_rho, units_needed, crossover_time, simulate_units,
                              allan_var, fit_allan)

CHEAP = Grade(0.005, 8.7e-5)


def test_single_unit_variance_formula():
    assert angle_var(Grade(2.0, 0.0), 10) == pytest.approx(40.0)
    assert angle_var(Grade(0.0, 3.0), 2) == pytest.approx(9 * 8 / 3)


def test_fused_factor_limits():
    assert fused_factor(1, 0.3) == 1.0
    assert fused_factor(100, 0.0) == pytest.approx(0.01)
    assert fused_factor(10 ** 6, 0.2) == pytest.approx(0.2, abs=1e-5)


def test_white_only_needs_k_squared_units():
    k = 4
    b = better_grade(Grade(1.0, 0.0), k)
    assert units_needed(Grade(1.0, 0.0), b, 100, 0.0, 0.0) == k * k


def test_floor_makes_it_infeasible():
    b = better_grade(CHEAP, 3)
    # rho above 1/k^2 can never tie
    assert units_needed(CHEAP, b, 300, 0.12, 0.12) is None
    assert units_needed(CHEAP, b, 300, 0.10, 0.10) is not None


def test_breakeven_rho_matches_units_needed():
    b = better_grade(CHEAP, 3)
    r = breakeven_rho(CHEAP, b, 36, 300)
    assert fused_angle_var(CHEAP, 36, 300, r, r) == pytest.approx(angle_var(b, 300))


def test_crossover_time():
    g = Grade(0.01, 0.01 * math.sqrt(3) / 50)
    assert crossover_time(g) == pytest.approx(50.0)


def test_monte_carlo_matches_formula():
    rng = np.random.default_rng(1)
    g, n, T = CHEAP, 6, 200.0
    a = simulate_units(g, n, T, 1.0, 0.3, 0.5, 6000, rng)
    fused = a.mean(axis=1)
    assert fused.var() == pytest.approx(fused_angle_var(g, n, T, 0.3, 0.5), rel=0.06)
    assert a[:, 0].var() == pytest.approx(angle_var(g, T), rel=0.06)


def test_allan_fit_recovers_parameters():
    rng = np.random.default_rng(2)
    g, dt, T = Grade(0.01, 0.0004), 1.0, 200000
    steps = int(T / dt)
    bias = np.cumsum(g.K * math.sqrt(dt) * rng.standard_normal(steps))
    rate = bias + g.N / math.sqrt(dt) * rng.standard_normal(steps)
    ms = np.array([1, 2, 4, 8, 16, 32, 64, 128, 256, 512])
    av = np.array([allan_var(rate, dt, int(m)) for m in ms])
    N, K = fit_allan(ms * dt, av)
    assert N == pytest.approx(g.N, rel=0.15)
    assert K == pytest.approx(g.K, rel=0.25)
