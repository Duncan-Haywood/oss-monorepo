import math
import random
import unittest

from particle_twin.model import (Phi, mixture, c0, a_coef, rho, mean_ess_fraction, prob_ess_below, abs_quantile,
                                 particles_needed, particles_for_mean, pf_step, sample_ess, estimator_msd)


def quad_rho(y, P, R, n=40000):
    """E[w]^2 / E[w^2] by midpoint integration over the prior, independent of the closed form."""
    lim = 12.0 * math.sqrt(P)
    h = 2 * lim / n
    e1 = e2 = 0.0
    for i in range(n):
        x = -lim + (i + 0.5) * h
        dens = math.exp(-x * x / (2 * P)) / math.sqrt(2 * math.pi * P)
        w = math.exp(-0.5 * (y - x) ** 2 / R)
        e1 += dens * w * h
        e2 += dens * w * w * h
    return e1 * e1 / e2


def quad_mean(P, R, comps, n=4000):
    tot = 0.0
    for wc, Rc in comps:
        S = P + Rc
        lim = 12.0 * math.sqrt(S)
        h = 2 * lim / n
        for i in range(n):
            y = -lim + (i + 0.5) * h
            tot += wc * math.exp(-y * y / (2 * S)) / math.sqrt(2 * math.pi * S) * rho(y, P, R) * h
    return tot


class T(unittest.TestCase):
    def test_rho_vs_quadrature(self):
        for P, R, y in ((1, 1, 0), (1, 1, 2.5), (2, 0.5, 1.0), (0.3, 3.0, 4.0)):
            self.assertAlmostEqual(rho(y, P, R), quad_rho(y, P, R), places=6)

    def test_limits(self):
        self.assertAlmostEqual(c0(1e-9, 1.0), 1.0, places=6)  # uninformative measurement: prior is the posterior
        self.assertAlmostEqual(c0(1.0, 1e9), 1.0, places=6)
        self.assertLess(c0(1.0, 1e-3), 0.05)  # very informative measurement: weights collapse
        self.assertAlmostEqual(c0(1, 1), math.sqrt(3) / 2)

    def test_mean_vs_quadrature(self):
        for comps in (mixture(0, 1), mixture(0.05, 10), mixture(0.2, 3)):
            self.assertAlmostEqual(mean_ess_fraction(1, 1, comps), quad_mean(1, 1, comps), places=6)

    def test_dimension_power(self):
        comps = mixture(0, 1)
        self.assertAlmostEqual(mean_ess_fraction(1, 1, comps, 5), mean_ess_fraction(1, 1, comps) ** 5)

    def test_tail_probability(self):
        comps = mixture(0.05, 10)
        # theta = rho at |y| = t gives P(|y| > t) directly
        t = 3.0
        theta = rho(t, 1, 1)
        direct = sum(w * 2 * (1 - Phi(t / math.sqrt(1 + Rc))) for w, Rc in comps)
        self.assertAlmostEqual(prob_ess_below(theta, 1, 1, comps), direct, places=12)
        self.assertEqual(prob_ess_below(1.0, 1, 1, comps), 1.0)

    def test_quantile_roundtrip(self):
        comps = mixture(0.05, 10)
        for d in (0.2, 0.01):
            t = abs_quantile(d, 1, comps)
            self.assertAlmostEqual(sum(w * 2 * (1 - Phi(t / math.sqrt(1 + Rc))) for w, Rc in comps), d, places=9)

    def test_sizing(self):
        tw, re = mixture(0, 1), mixture(0.05, 10)
        self.assertGreater(particles_needed(50, 0.01, 1, 1, re), 1e6 * particles_needed(50, 0.01, 1, 1, tw))
        self.assertAlmostEqual(particles_for_mean(50, 1, 1, tw), 50 / mean_ess_fraction(1, 1, tw))

    def test_far_tail_does_not_underflow(self):
        ess, m = pf_step(random.Random(1), 200, 1.0, 1.0, 40.0)
        self.assertTrue(1.0 <= ess < 3.0)
        self.assertTrue(math.isfinite(m))

    def test_monte_carlo_matches_closed_form(self):
        rng = random.Random(3)
        mc, _ = sample_ess(rng, 1500, 1.0, 1.0, mixture(0, 1), 400)
        self.assertAlmostEqual(mc, mean_ess_fraction(1, 1, mixture(0, 1)), delta=0.02)

    def test_ess_bounds_and_dimension(self):
        _, ess = sample_ess(random.Random(5), 100, 1.0, 1.0, mixture(0.05, 10), 100, d=3)
        self.assertTrue(all(1.0 <= e <= 100.0 + 1e-9 for e in ess))

    def test_estimator_error_worse_on_outliers(self):
        rng = random.Random(9)
        self.assertLess(10 * estimator_msd(rng, 100, 1, 1, mixture(0, 1), 400), estimator_msd(rng, 100, 1, 1, mixture(0.05, 10), 400))


if __name__ == "__main__":
    unittest.main()
