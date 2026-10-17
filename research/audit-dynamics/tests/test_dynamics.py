import unittest
from audit_dynamics import (Params, equilibrium, potential, omega, period, hedge,
                            replicator_rk4, stochastic_hedge)


class T(unittest.TestCase):
    def setUp(self):
        self.p = Params(s=1.0, S=4.0, k=0.5)

    def test_equilibrium_is_fixed_point(self):
        x, y = equilibrium(self.p)
        xs, ys = hedge(self.p, 0.1, 50, x0=x, y0=y)
        self.assertAlmostEqual(xs[-1], x, places=9)
        self.assertAlmostEqual(ys[-1], y, places=9)

    def test_dilemma_has_no_interior_equilibrium(self):
        with self.assertRaises(ValueError):
            equilibrium(Params(1, 0.5, 0.5))

    def test_flow_conserves_potential(self):
        path = replicator_rk4(self.p, 0.001, 10, x0=0.3, y0=0.3)
        h0, h1 = potential(self.p, *path[0]), potential(self.p, *path[-1])
        self.assertAlmostEqual(h0, h1, places=6)

    def test_hedge_potential_nondecreasing(self):
        for eta in (0.01, 0.05):  # larger eta drives logits into the numerical clamp (+-40)
            x, y = hedge(self.p, eta, 2000, x0=0.3, y0=0.6)
            H = [potential(self.p, a, b) for a, b in zip(x, y)]
            self.assertTrue(all(H[i + 1] >= H[i] - 1e-12 for i in range(len(H) - 1)))
            self.assertGreater(H[-1], H[0])

    def test_period_prediction(self):
        eta = 0.005
        xs_, ys_ = equilibrium(self.p)
        x, _ = hedge(self.p, eta, int(6 * period(self.p, eta)), x0=xs_ + 0.005, y0=ys_)
        c = [i for i in range(1, len(x)) if x[i - 1] < xs_ <= x[i]]
        meas = (c[-1] - c[0]) / (len(c) - 1)
        self.assertLess(abs(meas / period(self.p, eta) - 1), 0.01)

    def test_time_average_converges_last_iterate_does_not(self):
        xs_, ys_ = equilibrium(self.p)
        x, y = hedge(self.p, 0.05, 20000, x0=0.3, y0=0.3)
        self.assertLess(abs(sum(x) / len(x) - xs_), 0.02)
        self.assertLess(abs(sum(y) / len(y) - ys_), 0.01)
        self.assertGreater(max(abs(v - ys_) for v in y[-2000:]), 0.1)

    def test_optimistic_converges_last_iterate(self):
        xs_, ys_ = equilibrium(self.p)
        x, y = hedge(self.p, 0.1, 3000, x0=0.3, y0=0.3, optimistic=True)
        self.assertLess(abs(x[-1] - xs_), 1e-6)
        self.assertLess(abs(y[-1] - ys_), 1e-6)

    def test_sampled_hedge_frequencies(self):
        xs_, ys_ = equilibrium(self.p)
        _, _, cheats, checks = stochastic_hedge(self.p, 0.5, 40000, seed=1)
        self.assertLess(abs(cheats / 40000 - xs_), 0.03)
        self.assertLess(abs(checks / 40000 - ys_), 0.03)


if __name__ == "__main__":
    unittest.main()
