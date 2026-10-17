import math
import unittest

from gust_twin.model import (real_var, white_var, psd_matched_var, ratio_real_over_psd, ratio_real_over_twin, crossover_dt,
                             expm, real_var_exact_discrete, twin_var_exact, twin_var_continuum, simulate_real, simulate_twin,
                             fit_ou_from_lag1, exceedance, margin_for, dlyap)

KP, KD = 1.0, 1.4


class T(unittest.TestCase):
    def test_expm_rotation(self):
        E = expm([[0.0, -2.0], [2.0, 0.0]])
        self.assertAlmostEqual(E[0][0], math.cos(2.0), places=12)
        self.assertAlmostEqual(E[1][0], math.sin(2.0), places=12)

    def test_dlyap_scalar(self):
        self.assertAlmostEqual(dlyap([[0.5]], [[3.0]])[0][0], 4.0, places=12)

    def test_real_var_matches_joint_lyapunov(self):
        for a in (0.1, 1.0, 7.0):
            for dt in (0.01, 0.2):
                self.assertAlmostEqual(real_var_exact_discrete(KP, KD, a, 2.0, dt), real_var(KP, KD, a, 2.0), places=8)

    def test_white_limit_of_real(self):
        # a -> infinity at fixed spectral density 2 s2 / a = q: real variance -> white variance
        q = 0.5
        for a in (1e3, 1e5):
            self.assertAlmostEqual(real_var(KP, KD, a, q * a / 2) / white_var(KP, KD, q), 1.0, delta=2.0 * (KD + KP) / a)

    def test_twin_var_continuum_small_dt(self):
        for dt in (1e-2, 1e-3):
            self.assertAlmostEqual(twin_var_exact(KP, KD, 1.0, dt) / twin_var_continuum(KP, KD, 1.0, dt), 1.0, delta=2 * dt * KD)

    def test_twin_std_scales_sqrt_dt(self):
        r = twin_var_exact(KP, KD, 1.0, 1e-3) / twin_var_exact(KP, KD, 1.0, 1e-2)
        self.assertAlmostEqual(r, 0.1, delta=0.005)

    def test_psd_matched_always_overstates(self):
        for a in (0.01, 0.3, 1.0, 10.0, 1e3):
            self.assertLess(ratio_real_over_psd(KP, KD, a), 1.0)
            self.assertAlmostEqual(ratio_real_over_psd(KP, KD, a) * psd_matched_var(KP, KD, a, 1.3), real_var(KP, KD, a, 1.3), places=12)
        self.assertAlmostEqual(ratio_real_over_psd(KP, KD, 1e-6), 0.0, places=5)   # slow gusts: psd-matched is very conservative
        self.assertAlmostEqual(ratio_real_over_psd(KP, KD, 1e6), 1.0, places=5)    # fast gusts: exact

    def test_variance_ratio_and_crossover(self):
        self.assertAlmostEqual(ratio_real_over_twin(KP, KD, 1.0, crossover_dt(KP, KD, 1.0)), 1.0, places=12)
        self.assertAlmostEqual(ratio_real_over_twin(KP, KD, 1.0, 0.01), real_var(KP, KD, 1.0, 1.0) / twin_var_continuum(KP, KD, 1.0, 0.01), places=12)

    def test_monte_carlo_real(self):
        v = simulate_real(KP, KD, 1.0, 1.0, 0.05, 200000, seed=3)
        self.assertAlmostEqual(v / real_var(KP, KD, 1.0, 1.0), 1.0, delta=0.06)

    def test_monte_carlo_twin(self):
        v = simulate_twin(KP, KD, 1.0, 0.05, 200000, seed=4)
        self.assertAlmostEqual(v / twin_var_exact(KP, KD, 1.0, 0.05), 1.0, delta=0.06)

    def test_ou_fit_recovers_rate(self):
        import random
        rng = random.Random(1)
        a, s2, delta = 0.8, 2.0, 0.1
        rho = math.exp(-a * delta)
        d, xs = 0.0, []
        for _ in range(200000):
            d = rho * d + math.sqrt(s2 * (1 - rho * rho)) * rng.gauss(0, 1)
            xs.append(d)
        ah, s2h = fit_ou_from_lag1(xs, delta)
        self.assertAlmostEqual(ah / a, 1.0, delta=0.03)
        self.assertAlmostEqual(s2h / s2, 1.0, delta=0.03)

    def test_exceedance_margin_roundtrip(self):
        m = margin_for(1e-3, 2.0)
        self.assertAlmostEqual(exceedance(m, 2.0), 1e-3, places=9)
        self.assertAlmostEqual(m / math.sqrt(2.0), 3.2905267, places=5)


if __name__ == "__main__":
    unittest.main()
