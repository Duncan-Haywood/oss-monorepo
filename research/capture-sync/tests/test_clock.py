"""Step 6c: a recorder whose clock rate wanders (capture_sync.clock)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from capture_sync import clock as C  # noqa: E402
from capture_sync import wacd as W  # noqa: E402

FS = 16000


def test_phi_is_linear_for_a_constant_rate():
    ph = C.phi(np.full(1000, 300.0))
    assert np.allclose(ph, np.arange(1000) * (1 + 300e-6))


def test_record_matches_a_sinusoid_read_at_the_inverse_map():
    n = 20 * FS
    m = np.arange(n)
    f = 1234.5
    x = np.sin(2 * np.pi * f * m / FS)
    eps = C.warmup_ppm(m / FS, 100.0, 300.0, 5.0)  # large, fast wander to make the test sharp
    y, ph = C.record(x, eps)
    psi = np.interp(np.arange(len(y)), ph, m.astype(float))
    ref = np.sin(2 * np.pi * f * psi / FS)
    inner = slice(FS, len(y) - FS)
    assert np.max(np.abs(y[inner] - ref[inner])) < 2e-3


def test_constant_rate_agrees_with_paderwasn_resampler():
    rng = np.random.default_rng(1)
    x = np.convolve(rng.standard_normal(12 * FS), np.ones(4) / 4, mode="same")
    y, _ = C.record(x, np.full(len(x), 300.0))
    z = W.sim_sro(x, 300.0)
    k = min(len(y), len(z)) - FS
    a, b = y[FS:k], z[FS:k]
    assert np.corrcoef(a, b)[0, 1] > 0.99


def test_warmup_integral_is_the_integral():
    t = np.linspace(0, 600, 600001)
    r = C.warmup_ppm(t, 0.0, 10.0, 120.0)
    num = np.concatenate([[0], np.cumsum((r[1:] + r[:-1]) / 2 * np.diff(t))])
    assert np.allclose(num, C.warmup_integral(t, 10.0, 120.0), atol=1e-6)


def test_fast_envelope_normalise_matches_the_library_one():
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "tracker"))
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "baselines"))
    from capture_sync.sync import envelope_normalise
    import wander
    rng = np.random.default_rng(2)
    x = rng.standard_normal(3 * FS) * np.repeat(rng.uniform(0.01, 3, 30), FS // 10)
    assert np.allclose(wander.env_norm(x), envelope_normalise(x), rtol=1e-8, atol=1e-10)
