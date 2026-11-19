"""Step 3l: the mix of shared and independent noise, and the coherent-SNR model."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "experiments", "gate"))
import noisemix as NM  # noqa: E402


def test_mix_endpoints_are_bit_exact_replays():
    """rho 0 adds exactly step 3c's scaled independent noise, rho 1 exactly step 3f's scaled shared noise."""
    rng = np.random.default_rng(0)
    x0, ind, sh = rng.standard_normal(500), rng.standard_normal(500), 3 * rng.standard_normal(500)
    s = float(np.mean(x0 ** 2))
    k = lambda z: np.sqrt(s / 10 ** (NM.SNR / 10) / (np.mean(z ** 2) + 1e-20))  # noqa: E731
    assert np.array_equal(NM.mix(x0, s, ind, sh, 0.0), x0 + ind * k(ind))
    assert np.array_equal(NM.mix(x0, s, ind, sh, 1.0), x0 + sh * k(sh))


def test_mix_keeps_total_noise_power():
    rng = np.random.default_rng(1)
    n = 200000
    x0 = np.zeros(n)
    ind, sh = rng.standard_normal(n), 5 * rng.standard_normal(n)
    for rho in NM.RHOS:
        y = NM.mix(x0, 1.0, ind, sh, rho)
        assert abs(np.mean(y ** 2) - 10.0) < 0.15  # -10 dB against unit speech power


def test_effective_snr_model():
    assert np.isclose(NM.eff_snr_db(0.0), -10.0)
    assert np.isclose(NM.eff_snr_db(0.5), 10 * np.log10(6 / 5))
    assert np.isclose(NM.eff_snr_db(0.9), 10.0)
    assert all(np.diff([NM.eff_snr_db(r) for r in NM.RHOS[:-1]]) > 0)
