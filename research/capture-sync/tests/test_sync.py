import numpy as np
from capture_sync import gcc, theil_sen, window_delay, reference_line, closure, auroc, pick_threshold, FS


def _noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def _delayed(x, d):
    """x delayed by d seconds (FFT phase ramp, so fractional delays are exact)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1.0 / FS)
    return np.fft.irfft(np.fft.rfft(x) * np.exp(-2j * np.pi * f * d), n)


def test_gcc_recovers_fractional_delay():
    x = _noise(4 * FS, 1)
    y = _delayed(x, 0.0123)
    d, psr = gcc(x[FS:3 * FS], y[FS:3 * FS], gamma=1.0, max_lag_s=0.1)
    assert abs(d - 0.0123) < 2e-5
    assert psr > 10


def test_gcc_gamma_zero_also_finds_broadband_delay():
    x = _noise(4 * FS, 2)
    y = _delayed(x, -0.004)
    d, _ = gcc(x, y, gamma=0.0, max_lag_s=0.05)
    assert abs(d + 0.004) < 1e-4


def test_window_delay_with_prior_and_search():
    x = _noise(30 * FS, 3)
    y = np.concatenate([np.zeros(int(2.5 * FS)), x])  # y lags x by 2.5 s
    d, _ = window_delay(x, y, t=10.0, win_s=2.0, prior_s=2.2, search_s=0.5, gamma=1.0)
    assert abs(d - 2.5) < 1e-3
    assert window_delay(x, y, t=29.5, win_s=2.0, prior_s=2.2, search_s=0.5, gamma=1.0) is None


def test_theil_sen_ignores_outliers():
    t = np.arange(50.0)
    y = 0.3 + 40e-6 * t
    y[[3, 10, 20, 33]] += [1.0, -2.0, 0.5, 3.0]
    a, s = theil_sen(t, y)
    assert abs(a - 0.3) < 1e-9 and abs(s - 40e-6) < 1e-12


def test_reference_line_recovers_offset_and_drift():
    # y = x resampled 100 ppm fast and delayed 0.4 s: tau(t) = 0.4 + 100e-6 t
    rng = np.random.default_rng(4)
    dur = 200.0
    tx = np.arange(int(dur * FS)) / FS
    base = rng.standard_normal(int((dur + 2) * FS))
    # sample base at times (ty - 0.4) / (1 + 100e-6) for y's sample times ty, via linear interpolation of
    # a smooth version of base (low-passed so interpolation is accurate)
    from scipy.signal import butter, sosfiltfilt
    sos = butter(8, 3000, fs=FS, output="sos")
    sm = sosfiltfilt(sos, base)
    x = sm[:len(tx)]
    ty = np.arange(int(dur * FS)) / FS
    src = (ty - 0.4) / (1 + 100e-6)
    y = np.interp(src, np.arange(len(sm)) / FS, sm, left=0.0, right=0.0)
    ref = reference_line(x, y, d0=0.4, win_s=10.0, hop_s=10.0, search_s=0.1)
    # delay at x-time t is t*(1+s) + d - t: s ~ 100 ppm, d ~ 0.4
    assert abs(ref["d"] - 0.4) < 2e-4
    assert abs(ref["s"] - 100e-6) < 3e-6


def test_closure_is_zero_for_consistent_lines():
    ij = {"d": 0.5, "s": 20e-6}
    jk = {"d": -1.2, "s": -35e-6}
    # tau_ik(t) = tau_ij(t) + tau_jk(t + tau_ij(t)), which is again a line
    ik = {"d": 0.5 + (-1.2) + (-35e-6) * 0.5, "s": 20e-6 + (-35e-6) * (1 + 20e-6)}
    for t in [0.0, 100.0, 600.0]:
        assert abs(closure(ij, jk, ik, t)) < 1e-12


def test_auroc_and_threshold():
    assert auroc([1, 2, 3], [4, 5, 6]) == 1.0
    assert auroc([4, 5, 6], [1, 2, 3]) == 0.0
    assert auroc([1, 2], [1, 2]) == 0.5
    psr = np.arange(100.0)
    bad = psr < 30
    th = pick_threshold(psr, bad, max_fail=0.0, min_keep=10)
    assert th == 30.0
    assert pick_threshold(psr, np.ones(100, bool), max_fail=0.01) == float("inf")
