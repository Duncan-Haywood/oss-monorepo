import math
import random
import unittest

from deadtime_twin.model import (phi, Phi, rate_twin, rate_nonpar, rate_par, invert_nonpar, invert_par, first_photon_pdf,
                                 first_photon_moments, first_photon_mode, p_detect, sample_first_photons, coates_mean, _quad)


class TestCounting(unittest.TestCase):
    def test_twin_is_identity_and_low_flux_limit(self):
        self.assertEqual(rate_twin(0.3), 0.3)
        for f in (rate_nonpar, rate_par):
            self.assertAlmostEqual(f(1e-6) / 1e-6, 1.0, places=5)

    def test_nonpar_values_and_inverse(self):
        self.assertAlmostEqual(rate_nonpar(1.0), 0.5)
        for x in (0.01, 0.7, 3.0, 40.0):
            self.assertAlmostEqual(invert_nonpar(rate_nonpar(x)), x, places=9)
        self.assertLess(rate_nonpar(1e9), 1.0)
        with self.assertRaises(ValueError):
            invert_nonpar(1.0)

    def test_par_peak_and_branches(self):
        self.assertAlmostEqual(rate_par(1.0), 1 / math.e)
        self.assertIsNone(invert_par(0.4))
        for y in (0.01, 0.2, 0.36):
            lo, hi = invert_par(y)
            self.assertLessEqual(lo, 1.0)
            self.assertGreaterEqual(hi, 1.0)
            self.assertAlmostEqual(rate_par(lo), y, places=9)
            self.assertAlmostEqual(rate_par(hi), y, places=9)
        lo, hi = invert_par(1 / math.e)
        self.assertAlmostEqual(lo, 1.0, places=5)
        self.assertAlmostEqual(hi, 1.0, places=5)

    def test_par_known_branches(self):
        lo, hi = invert_par(0.2)
        self.assertAlmostEqual(lo, 0.2591711, places=6)
        self.assertAlmostEqual(hi, 2.5426414, places=6)


class TestTiming(unittest.TestCase):
    def test_phi_Phi(self):
        self.assertAlmostEqual(Phi(0), 0.5)
        self.assertAlmostEqual(_quad(phi), 1.0, places=9)

    def test_pdf_mass_is_detection_probability(self):
        for N in (0.1, 1.0, 5.0, 20.0):
            self.assertAlmostEqual(_quad(lambda t: first_photon_pdf(t, N)), p_detect(N), places=7)

    def test_small_N_bias_law(self):
        # bias ~ -N / (2 sqrt(pi)) as N -> 0
        for N in (0.001, 0.01):
            m, s = first_photon_moments(N)
            self.assertAlmostEqual(m / (-N / (2 * math.sqrt(math.pi))), 1.0, places=2)
            self.assertAlmostEqual(s, 1.0, places=3)

    def test_bias_monotone_and_std_shrinks(self):
        prev_m, prev_s = 0.0, 2.0
        for N in (0.1, 0.5, 1, 2, 5, 10, 30):
            m, s = first_photon_moments(N)
            self.assertLess(m, prev_m)
            self.assertLess(s, prev_s)
            prev_m, prev_s = m, s

    def test_mode_is_density_maximum(self):
        for N in (1.0, 5.0):
            t = first_photon_mode(N)
            for d in (-0.05, 0.05):
                self.assertGreater(first_photon_pdf(t, N), first_photon_pdf(t + d, N))

    def test_mc_matches_quadrature_and_coates_removes_bias(self):
        rng = random.Random(7)
        N, M = 3.0, 60000
        ts = sample_first_photons(N, M, rng)
        d = [t for t in ts if t is not None]
        self.assertAlmostEqual(len(d) / M, p_detect(N), delta=0.005)
        self.assertAlmostEqual(sum(d) / len(d), first_photon_moments(N)[0], delta=0.02)
        self.assertLess(abs(coates_mean(ts, M)), 0.03)


if __name__ == "__main__":
    unittest.main()
