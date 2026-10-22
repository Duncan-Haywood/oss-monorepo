import numpy as np
from capture_syncslope import simulate, true_delay


def test_true_delay_linear_and_wobble_zero_mean_rate():
    assert abs(true_delay(1000.0) - (0.8 + 0.04)) < 1e-12
    # a wobble integrates to zero extra delay after a full period
    assert abs(true_delay(3600.0, wobble_ppm=20) - true_delay(3600.0)) < 1e-12


def test_clean_audio_slope_beats_offset_at_long_interval():
    # 0 dB: every estimate is exact; offset hold drifts out (analytic 44% at 1800 s), line does not
    off = simulate(0, "offset", every_s=1800, snr_db=0, span_s=36000)[0]
    sl = simulate(0, "slope", every_s=1800, snr_db=0, span_s=36000)[0]
    assert off > 0.4 and sl < 0.05


def test_offset_matches_analytic_share_without_noise():
    # exact estimates every 1800 s, 40 ppm, 40 ms: bad when drift since sync > 1000 s -> 800/1800
    off = simulate(1, "offset", every_s=1800, snr_db=0, span_s=36000)[0]
    assert abs(off - 800 / 1800) < 0.03


def test_wobble_hurts_slope():
    a = simulate(0, "slope", every_s=1800, snr_db=0, span_s=7200, wobble_ppm=0)[0]
    b = simulate(0, "slope", every_s=1800, snr_db=0, span_s=7200, wobble_ppm=30, wobble_period_s=3600)[0]
    assert b > a


def test_reset_recovers_from_lockout():
    kw = dict(every_s=300, snr_db=0, span_s=21600, wobble_ppm=30)
    locked = simulate(0, "slope", **kw)[0]
    reset = simulate(0, "slope", reset_after=2, **kw)[0]
    assert locked > 0.5 and reset < locked
