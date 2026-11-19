import math
import numpy as np
import pytest
from sensing_imutemp import (Grade, white_walk_var, temp_ramp_q, fused_var, better_grade,
                             units_needed, floor_rms, max_ramp_for_tie, simulate)

CHEAP = Grade(0.005, 8.7e-5, 0.002, 0.004)


def test_ramp_integral():
    assert temp_ramp_q(0.01, 100) == pytest.approx(50.0)


def test_no_ramp_reduces_to_white_walk_over_n():
    assert fused_var(CHEAP, 4, 100, 0.0) == pytest.approx(white_walk_var(CHEAP, 100) / 4)


def test_floor_independent_of_n():
    big = fused_var(CHEAP, 10 ** 9, 100, 0.01)
    assert math.sqrt(big) == pytest.approx(floor_rms(CHEAP, 100, 0.01), rel=1e-6)


def test_compensation_scales_floor():
    assert floor_rms(CHEAP, 100, 0.01, 0.1) == pytest.approx(0.1 * floor_rms(CHEAP, 100, 0.01))


def test_units_needed_is_minimal_and_sufficient():
    b = better_grade(CHEAP, 3)
    n = units_needed(CHEAP, b, 100, 0.001)
    assert n is not None
    target = fused_var(b, 1, 100, 0.001)
    assert fused_var(CHEAP, n, 100, 0.001) <= target * (1 + 1e-9)
    if n > 1:
        assert fused_var(CHEAP, n - 1, 100, 0.001) > target


def test_infeasible_when_floor_exceeds_better_unit():
    b = better_grade(CHEAP, 3)
    assert units_needed(CHEAP, b, 100, 0.05) is None


def test_no_ramp_gives_k_squared():
    b = better_grade(CHEAP, 4)
    assert units_needed(CHEAP, b, 100, 0.0) == 16


def test_max_ramp_consistent_with_units_needed():
    b = better_grade(CHEAP, 3)
    r = max_ramp_for_tie(CHEAP, b, 30, 100)
    assert units_needed(CHEAP, b, 100, r * 0.99) <= 30
    assert units_needed(CHEAP, b, 100, r * 1.05) is None or units_needed(CHEAP, b, 100, r * 1.05) > 30


def test_monte_carlo_matches_formula():
    rng = np.random.default_rng(3)
    a = simulate(CHEAP, 6, 100.0, 1.0, 0.002, 8000, rng)
    assert np.mean(a ** 2) == pytest.approx(fused_var(CHEAP, 6, 100.0, 0.002), rel=0.06)


# Added in quality round 89 (portfolio/quality/audits/2026-11-19-sensing-imutemp.json):
# the published tables use run.py's grade, and two seeded bugs (better-grade tempco
# scaled by sqrt(k), ceil -> round in units_needed) left every test above green.
RUN_GRADE = Grade(0.005, 0.005 * math.sqrt(3) / 100.0, 0.002, 0.004)


def test_table_a_row_point_one_degc_per_min():
    r = 0.1 / 60
    assert units_needed(RUN_GRADE, better_grade(RUN_GRADE, 3), 100, r) == 15
    assert units_needed(RUN_GRADE, better_grade(RUN_GRADE, 10), 100, r) is None


def test_floor_condition_k2_never_infeasible():
    # The floor binds only when mu^2 (k^2 - 1) > s^2; with mu = 0.002, s = 0.004
    # that fails at k = 2, so some n always ties a 2x better unit.
    b = better_grade(RUN_GRADE, 2)
    for rm in (1.0, 10.0, 100.0):
        assert units_needed(RUN_GRADE, b, 100, rm / 60) is not None


def test_asymptotic_ramp_limit_k3():
    # As n -> inf: q^2 (mu^2 (k^2 - 1) - s^2) = k^2 (N^2 T + K^2 T^3 / 3) for the
    # better unit's white+walk; ramp limit 0.2121 degC/min at k = 3, T = 100 s.
    b = better_grade(RUN_GRADE, 3)
    assert units_needed(RUN_GRADE, b, 100, 0.20 / 60) is not None
    assert units_needed(RUN_GRADE, b, 100, 0.22 / 60) is None
