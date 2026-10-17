import math, unittest
from handover_twin import *

W, C = 1.0, 5.0


class T(unittest.TestCase):
    def test_closed_form_matches_simulation(self):
        d = Lognormal(0.0, 1.2)
        for tau in (1.0, 5.0):
            self.assertAlmostEqual(simulate_cost(d, W, C, tau, 200000, 1) / cost(d, W, C, tau), 1.0, delta=0.01)

    def test_weibull_simpson_matches_simulation(self):
        d = Weibull.with_mean(2.0, 2.0)
        self.assertAlmostEqual(simulate_cost(d, W, C, 3.0, 200000, 2) / cost(d, W, C, 3.0), 1.0, delta=0.01)

    def test_hazard_rule_and_optimality(self):
        d = Lognormal(0.0, 1.2)
        ts = lognormal_tau_star(0.0, 1.2, W, C)
        self.assertAlmostEqual(d.hazard(ts), W / C, places=9)
        for f in (0.5, 0.9, 1.1, 2.0):
            self.assertLess(cost(d, W, C, ts), cost(d, W, C, ts * f))
        self.assertLess(cost(d, W, C, ts), cost(d, W, C, math.inf))
        self.assertLess(cost(d, W, C, ts), cost(d, W, C, 0.0))

    def test_constant_hazard_is_a_corner(self):
        e = Exponential(2.0)  # w/c = 0.2 < hazard 0.5: never abort; cost w*mean
        t, j = best_timeout(e, W, C)
        self.assertTrue(math.isinf(t)); self.assertAlmostEqual(j, 2.0, places=9)
        e2 = Exponential(20.0)  # hazard 0.05 < 0.2: abort at once, cost c
        t, j = best_timeout(e2, W, C)
        self.assertEqual(t, 0.0); self.assertAlmostEqual(j, C, places=9)

    def test_light_tailed_twin_regret_is_never_abort_gap(self):
        real = Lognormal(0.0, 1.2)
        _, _, reg, jr = twin_policy_regret(real, Exponential(real.mean()), W, C)
        self.assertAlmostEqual(reg, W * real.mean() - jr, places=9)
        self.assertGreater(reg, 0)

    def test_delta_method_regret_scale(self):
        import random
        real, rng = Lognormal(0.0, 1.2), random.Random(3)
        _, jr = best_timeout(real, W, C)
        regs = []
        for _ in range(600):
            mu, sg = fit_lognormal([real.sample(rng) for _ in range(200)])
            regs.append(cost(real, W, C, plugin_timeout(mu, sg, W, C)) - jr)
        self.assertAlmostEqual(sum(regs) / len(regs) / regret_delta(0.0, 1.2, W, C, 200)[0], 1.0, delta=0.2)


if __name__ == "__main__":
    unittest.main()
