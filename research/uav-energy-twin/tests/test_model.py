import math, random, unittest
from uav_energy_twin.model import *

REAL = Params(0.3, 0.25)


class TestUavEnergyTwin(unittest.TestCase):
    def test_twin_speed_quintic_is_argmin(self):
        for mu in (0.0, 0.2, 0.5, -0.3):
            v = v_twin(mu)
            e = 1e-5
            f = lambda x: twin_energy(Params(mu, 0.0), x)
            self.assertAlmostEqual((f(v + e) - f(v - e)) / (2 * e), 0.0, places=5)
        self.assertAlmostEqual(v_twin(0.0), 1.0)

    def test_monte_carlo_matches_closed_form(self):
        rng = random.Random(1)
        for v in (0.9, 1.2):
            mc, st = simulate_energy(REAL, v, 300_000, rng)
            self.assertEqual(st, 0.0)
            self.assertAlmostEqual(mc / energy_per_dist(REAL, v), 1.0, delta=0.003)

    def test_jensen_factor_is_artanh_ratio_and_exceeds_one(self):
        v = 1.0
        self.assertAlmostEqual(energy_per_dist(REAL, v), twin_energy(REAL, v) * jensen_factor(REAL, v), places=12)
        x = REAL.a / (v - REAL.mu)
        self.assertGreater(jensen_factor(REAL, v), 1 + x * x / 3)

    def test_zero_spread_recovers_twin(self):
        p = REAL.replace(a=0.0)
        self.assertAlmostEqual(v_opt(REAL.replace(a=1e-6)), v_twin(p.mu), places=3)
        self.assertAlmostEqual(regret(p.replace(a=1e-6), v_twin(p.mu)), 0.0, places=6)

    def test_stall_cliff(self):
        v = v_twin(REAL.mu)
        real = REAL.replace(a=v - REAL.mu + 0.05)
        self.assertEqual(energy_per_dist(real, v), math.inf)
        self.assertGreater(stall_prob(real, v), 0)

    def test_depletion_and_margin_exact(self):
        rng = random.Random(2)
        v = v_twin(REAL.mu)
        m = 0.1
        hits = 0
        N = 200_000
        B = twin_energy(Params(REAL.mu, 0.0), v) * (1 + m)
        for _ in range(N):
            w = rng.uniform(REAL.mu - REAL.a, REAL.mu + REAL.a)
            hits += (P(v) / (v - w) > B)
        self.assertAlmostEqual(hits / N, depletion_prob(REAL, v, m), delta=0.003)
        for eps in (0.01, 0.1):
            self.assertAlmostEqual(depletion_prob(REAL, v, margin_for(REAL, v, eps)), eps, places=9)

    def test_fit_recovers_parameters(self):
        rng = random.Random(3)
        q = fit_uniform(REAL, 20_000, rng)
        self.assertAlmostEqual(q.mu, REAL.mu, delta=0.005)
        self.assertAlmostEqual(q.a, REAL.a, delta=0.01)


if __name__ == "__main__":
    unittest.main()
