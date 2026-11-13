import numpy as np
from capture_sync.threshold import welch, moments, p_fail, predict, gcc_fixed, FS


def test_welch_density_of_white_noise():
    x = np.random.default_rng(0).standard_normal(20 * FS)
    f, gxx, gyy, gxy, n = welch(x, x)
    m = (f > 200) & (f < 7000)
    # unit-variance white noise has one-sided density 2 / fs
    assert abs(np.mean(gxx[m]) * FS / 2 - 1) < 0.05
    assert np.allclose(gxx, gyy) and np.allclose(gxy.real, gxx)
    assert n == 20 * FS // 512


def test_moments_match_the_textbook_output_snr_for_white_signals():
    # flat signal density 1, noise density nn on each channel: mu / sigma1 = sqrt(2 L B) / (1 + nn) for gamma 0
    f = np.arange(0, 8000.5, 31.25)
    nn, L = 3.0, 2.0
    gxx = gyy = np.full(len(f), 1 + nn)
    gxy = np.ones(len(f), complex)
    mu, s0, s1, fb, P = moments(f, gxx, gyy, gxy, L, 0.0, band=(100.0, 4000.0))
    B = fb[-1] - fb[0] + (fb[1] - fb[0])
    assert abs(mu / s1 - np.sqrt(2 * L * B) / (1 + nn)) / (mu / s1) < 0.02
    assert s0 > s1
    # a flat weighting gives the same ratio for every gamma when the spectra are flat
    mu1, _, s11, _, _ = moments(f, gxx, gyy, gxy, L, 1.0, band=(100.0, 4000.0))
    assert abs(mu1 / s11 - mu / s1) < 1e-9


def test_p_fail_limits_and_monotone_in_snr():
    f = np.arange(0, 8000.5, 31.25)
    gxy = np.ones(len(f), complex)
    ps = []
    for nn in [0.0, 10.0, 30.0, 100.0, 1e4]:
        g = np.full(len(f), 1 + nn)
        ps.append(p_fail(*moments(f, g, g, gxy, 1.0, 0.0), span_s=2.9))
    assert ps[0] < 1e-6 and ps[-1] > 0.99
    assert all(b >= a for a, b in zip(ps, ps[1:]))


def test_rice_and_cells_models_agree_roughly_for_flat_spectra():
    f = np.arange(0, 8000.5, 31.25)
    g = np.full(len(f), 31.0)
    m = moments(f, g, g, np.ones(len(f), complex), 1.0, 0.0)
    pc, pr = p_fail(*m, span_s=2.9, model="cells"), p_fail(*m, span_s=2.9, model="rice")
    assert 0.05 < pc < 0.95 and 0.5 < pr / pc < 2


def test_gcc_fixed_finds_delay():
    rng = np.random.default_rng(3)
    s = rng.standard_normal(4 * FS)
    a = s[FS:2 * FS]
    b = s[FS - 4000:2 * FS + 4000]  # a[0] lines up with b[4000]
    for g in (0.0, 0.5, 1.0):
        assert abs(gcc_fixed(a, b, g, max_lag_s=0.5, centre_s=0.25) - 4000 / FS) < 1e-9


def test_prediction_tracks_monte_carlo_on_gaussian_signals():
    # plain correlation (gamma 0) is exactly Ianniello's setting: predicted and observed gross-error rates
    # agree within a factor of two on white Gaussian signals at -15 dB, 1 s windows
    rng = np.random.default_rng(11)
    n, G = FS, int(0.5 * FS)
    obs, pred = [], []
    for _ in range(60):
        s = rng.standard_normal(n + 4 * G)
        k = int(rng.integers(0, 2 * G))
        a = s[2 * G:2 * G + n] + 10 ** 0.75 * rng.standard_normal(n)
        b = s[2 * G - k:4 * G - k + n] + 10 ** 0.75 * rng.standard_normal(n + 2 * G)  # a[0] is b[k]
        d = gcc_fixed(a, b, 0.0, max_lag_s=0.5, centre_s=0.5)
        obs.append(abs(d - k / FS) > 1 / 30)
        pred.append(predict(a, b[k:k + n], 1.0, 0.0, span_s=1.0 - 2 / 30))
    o, p = np.mean(obs), np.mean(pred)
    assert 0.1 < o < 0.9
    assert 0.5 < p / o < 2
