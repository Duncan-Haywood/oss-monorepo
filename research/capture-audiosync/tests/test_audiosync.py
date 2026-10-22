import numpy as np
import pytest
from capture_audiosync import (fractional_delay, gcc_phat, make_pair, trial,
                               resync_interval_s, fit_track)


def test_fractional_delay_roundtrip():
    rng = np.random.default_rng(0)
    x = fractional_delay(rng.standard_normal(4096), 0)
    x = np.fft.irfft(np.fft.rfft(x) * (np.fft.rfftfreq(4096, 1 / 16000) < 4000), 4096)
    y = fractional_delay(fractional_delay(x, 0.00123), -0.00123)
    assert np.allclose(x, y, atol=1e-9)


@pytest.mark.parametrize("tau", [0.0, 0.0125, -0.4, 0.80033])
def test_noiseless_delay_recovered_within_a_sample_fraction(tau):
    rng = np.random.default_rng(1)
    a, b = make_pair(rng, tau, 2.0, snr_db=80)
    assert abs(gcc_phat(a, b) - tau) < 1 / 16000 / 2


def test_resync_interval_matches_analytic_example():
    # 40 ppm against one 30 fps frame (33.3 ms): 833 s
    assert resync_interval_s(40, 1 / 30) == pytest.approx(833.33, rel=1e-3)
    assert resync_interval_s(0, 1 / 30) == float("inf")


def test_theil_sen_ignores_a_minority_of_outliers():
    t = np.linspace(0, 100, 11)
    est = 0.5 + 4e-5 * t
    est[3] += 0.9
    est[8] -= 0.7
    icpt, slope = fit_track(t, est)
    assert slope == pytest.approx(4e-5, rel=1e-6) and icpt == pytest.approx(0.5, abs=1e-6)


def test_fit_beats_offset_only_over_an_hour():
    r = trial(3, ppm=40.0, snr_db=10.0)
    assert r["offset_only_max_ms"] > 1000 * 40e-6 * 3600 * 0.9   # about 144 ms
    assert r["fit_max_ms"] < 5.0


def test_short_window_with_long_lag_search_is_not_fooled_by_wraparound():
    rng = np.random.default_rng(5)
    a, b = make_pair(rng, 0.05, 0.5, snr_db=40)
    assert abs(gcc_phat(a, b, max_lag_s=2.0) - 0.05) < 1e-4
