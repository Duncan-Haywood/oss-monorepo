from dataclasses import replace

from house_schedule import Params, critical_path, run_many, simulate

QUIET = Params(gap_mean=0, weather_loss=0, dur_sigma=0, lead_sigma=0, insp_wait=0,
               insp_fail=0, order_early=True)


def test_deterministic_run_equals_critical_path():
    T, _ = simulate(QUIET, 1)
    assert abs(T - critical_path(QUIET)) < 1e-9


def test_same_seed_same_result():
    assert simulate(Params(), 7) == simulate(Params(), 7)


def test_more_handoff_gap_never_faster():
    for s in range(30):
        a = simulate(replace(Params(), gap_mean=0.5), s)[0]
        b = simulate(replace(Params(), gap_mean=3.0), s)[0]
        assert b >= a - 1e-9


def test_weather_and_failures_only_slow():
    base = run_many(replace(Params(), weather_loss=0, insp_fail=0), 200)[0]
    worse = run_many(Params(), 200)[0]
    assert sum(worse) > sum(base)


def test_parallel_rough_shortens_critical_path():
    assert critical_path(replace(QUIET, parallel_rough=True)) < critical_path(QUIET)


def test_interest_scales_with_time_and_rate():
    T, i = simulate(Params(), 3)
    T2, i2 = simulate(replace(Params(), rate=0.16), 3)
    assert T == T2 and abs(i2 - 2 * i) < 1e-9
