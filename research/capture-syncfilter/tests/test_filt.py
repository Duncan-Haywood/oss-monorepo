import numpy as np
from capture_syncfilter import simulate, scenario_delay, crystal_ppm
from capture_syncfilter.filt import Slope, Kalman, MODES


def exact(rng, resid, w):
    return resid + rng.normal(0, 0.0005)  # 0.5 ms estimate noise, no false peaks


def test_crystal_curve_matches_datasheet_form():
    # a3 = 1.05e-4 ppm/K^3 at 40 K from the inflection point, no cut-angle error: 6.72 ppm
    assert abs(float(crystal_ppm(65.0)) - 1.05e-4 * 40 ** 3) < 1e-9
    assert float(crystal_ppm(25.0)) == 0.0
    # a cut-angle error of 5 arcmin adds -0.085*5 ppm/K
    assert abs(float(crystal_ppm(26.0, dphi_arcmin=5.0)) - (-0.425 + 1.05e-4)) < 1e-9


def test_physical_rate_stays_within_a_few_ppm_of_base():
    for name in ("warmup", "sunday"):
        _, rate = scenario_delay(name)
        assert rate.max() - rate.min() < 30.0 and 10.0 < rate.mean() < 40.0


def test_delay_is_integral_of_rate():
    d, r = scenario_delay("static", span_s=1000.0)
    assert abs(d[1000] - (0.8 + 40e-6 * 1000)) < 1e-9


def test_theilsen_ignores_an_outlier_that_moves_least_squares():
    ts = np.arange(0, 8) * 300.0
    es = 0.8 + 40e-6 * ts
    es[3] += 0.2
    a, b = Slope(), Slope(robust=True)
    for t, e in zip(ts, es):
        a.add(t, e); b.add(t, e)
    truth = 0.8 + 40e-6 * 2400.0
    assert abs(b.predict(2400.0) - truth) < 1e-9 < abs(a.predict(2400.0) - truth)


def test_kalman_learns_the_rate():
    k = Kalman()
    for t in range(0, 3600, 300):
        k.add(float(t), 0.8 + 40e-6 * t)
    assert abs(k.x[1] - 40e-6) < 2e-6


def test_every_mode_beats_offset_on_a_steady_clock_at_long_intervals():
    kw = dict(scenario="static", every_s=1800, span_s=36000, estimate=exact)
    off = simulate(0, "offset", **kw)[0]
    assert off > 0.4
    for m in MODES[1:]:
        assert simulate(0, m, **kw)[0] < 0.1, m


def test_wide_gate_survives_wobble_that_locks_out_the_strict_gate():
    kw = dict(scenario="wobble30", every_s=300, estimate=exact)
    strict = simulate(0, "slope_strict", reset_after=0, **kw)[0]
    wide = simulate(0, "slope_wide", reset_after=0, **kw)[0]
    assert strict > 0.5 and wide < 0.2


def test_kalman_variants_parse():
    from capture_syncfilter.filt import make_holder
    assert make_holder("kalman_q20").q > make_holder("kalman_q1").q
