import math
import random
import unittest

from market_routing import (EntropicMarket, QuadraticMarket, softmax,
                            project_simplex, run_routing, hedge_regret_bound,
                            ftrl_l2_regret_bound)


def rand_gains(rng, n, T):
    return [[rng.random() for _ in range(n)] for _ in range(T)]


class SimplexTests(unittest.TestCase):
    def test_projection_is_on_simplex_and_sparse(self):
        p = project_simplex([2.0, 0.1, -1.0, 0.0])
        self.assertAlmostEqual(sum(p), 1.0)
        self.assertTrue(all(x >= 0 for x in p))
        self.assertEqual(p[2], 0.0)

    def test_projection_optimal_vs_random_points(self):
        rng = random.Random(0)
        v = [rng.gauss(0, 1) for _ in range(6)]
        p = project_simplex(v)
        d = lambda x: sum((a - b) ** 2 for a, b in zip(x, v))
        for _ in range(500):
            r = softmax([rng.gauss(0, 2) for _ in range(6)])
            self.assertLessEqual(d(p), d(r) + 1e-12)


class MarketTests(unittest.TestCase):
    def test_lmsr_price_is_hedge_weights(self):
        """Exact equivalence: market prices == multiplicative-weights iterate."""
        rng = random.Random(1)
        n, eta = 5, 0.3
        m = EntropicMarket(n, b=1 / eta)
        w = [1.0] * n
        for g in rand_gains(rng, n, 200):
            s = sum(w)
            for a, b_ in zip(m.prices(), [x / s for x in w]):
                self.assertAlmostEqual(a, b_, places=10)
            m.trade(g)
            w = [wi * math.exp(eta * gi) for wi, gi in zip(w, g)]

    def test_price_is_gradient_of_cost(self):
        for M in (EntropicMarket, QuadraticMarket):
            m = M(4, b=2.0)
            m.q = [0.7, -0.2, 1.5, 0.1]
            p = m.prices()
            for i in range(4):
                h = 1e-6
                up = list(m.q); up[i] += h
                dn = list(m.q); dn[i] -= h
                fd = (m.cost(up) - m.cost(dn)) / (2 * h)
                self.assertAlmostEqual(fd, p[i], places=4)

    def test_payment_at_least_price_times_bundle(self):
        rng = random.Random(2)
        for M in (EntropicMarket, QuadraticMarket):
            m = M(4, b=1.5)
            for _ in range(50):
                dq = [rng.uniform(-1, 1) for _ in range(4)]
                p = m.prices()
                pay = m.trade(dq)
                self.assertGreaterEqual(pay + 1e-9, sum(a * b for a, b in zip(p, dq)))

    def test_worst_case_loss_bound(self):
        rng = random.Random(3)
        for M in (EntropicMarket, QuadraticMarket):
            for _ in range(20):
                n = rng.randint(2, 8)
                m = M(n, b=rng.uniform(0.5, 3))
                for _ in range(60):
                    m.trade([rng.uniform(-2, 2) for _ in range(n)])
                for o in range(n):
                    self.assertLessEqual(m.maker_loss(o), m.max_loss_bound() + 1e-9)

    def test_lmsr_loss_bound_is_b_ln_n(self):
        self.assertAlmostEqual(EntropicMarket(8, b=2.0).max_loss_bound(), 2 * math.log(8))

    def test_quadratic_prices_can_be_exactly_sparse(self):
        m = QuadraticMarket(5, b=1.0)
        m.trade([3.0, 0.0, 0.0, -1.0, 0.0])
        p = m.prices()
        self.assertEqual(p[3], 0.0)
        self.assertTrue(any(x == 0.0 for x in p))
        e = EntropicMarket(5, b=1.0); e.trade([3.0, 0.0, 0.0, -1.0, 0.0])
        self.assertTrue(all(x > 0 for x in e.prices()))


class RegretTests(unittest.TestCase):
    def test_regret_within_bounds(self):
        rng = random.Random(4)
        n, T = 8, 600
        for _ in range(5):
            gains = rand_gains(rng, n, T)
            gains = [[g * (1.0 if i != 0 else 1.0) for i, g in enumerate(row)] for row in gains]
            for b in (5.0, 15.0):
                r = run_routing(EntropicMarket(n, b), gains)
                self.assertLessEqual(r.regret, hedge_regret_bound(n, T, b) + 1e-9)
                r = run_routing(QuadraticMarket(n, b), gains)
                self.assertLessEqual(r.regret, ftrl_l2_regret_bound(n, T, b) + 1e-9)

    def test_learns_best_expert(self):
        rng = random.Random(5)
        n, T = 6, 1500
        gains = [[(0.8 if i == 2 else 0.4) + rng.uniform(-0.2, 0.2) for i in range(n)] for _ in range(T)]
        for M in (EntropicMarket, QuadraticMarket):
            m = M(n, b=10.0)
            run_routing(m, gains)
            p = m.prices()
            self.assertEqual(max(range(n), key=lambda i: p[i]), 2)


if __name__ == "__main__":
    unittest.main()


class ForgettingTests(unittest.TestCase):
    def test_decay_recovers_after_switch_but_static_does_not(self):
        n, T = 4, 600
        gains = [[1.0 if i == (0 if t < 300 else 3) else 0.0 for i in range(n)] for t in range(T)]
        for M in (EntropicMarket, QuadraticMarket):
            static = M(n, b=1.0); run_routing(static, gains)
            forget = M(n, b=1.0); run_routing(forget, gains, decay=0.9)
            self.assertGreater(forget.prices()[3], 0.99)
            self.assertLess(static.prices()[3], forget.prices()[3])
