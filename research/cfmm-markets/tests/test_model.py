import math, random, unittest
from cfmm_markets import *


class T(unittest.TestCase):
    def test_invariant_and_price_gradient(self):
        rng = random.Random(1)
        for _ in range(50):
            n = rng.choice([2, 3, 5]); C0 = rng.uniform(1, 20)
            q = [rng.uniform(-5, 15) for _ in range(n)]
            r = reserves(q, C0)
            self.assertAlmostEqual(math.prod(r) / C0 ** n, 1.0, places=9)
            p = prices(q, C0)
            self.assertAlmostEqual(sum(p), 1.0, places=12)
            for i in range(n):
                h = 1e-5; qa = list(q); qb = list(q); qa[i] += h; qb[i] -= h
                self.assertAlmostEqual((cost(qa, C0) - cost(qb, C0)) / (2 * h), p[i], places=6)

    def test_convex_shift_and_homogeneity(self):
        rng = random.Random(2); C0 = 7.0
        for _ in range(50):
            q = [rng.uniform(-3, 10) for _ in range(3)]; r = [rng.uniform(-3, 10) for _ in range(3)]
            m = [(a + b) / 2 for a, b in zip(q, r)]
            self.assertLessEqual(cost(m, C0), (cost(q, C0) + cost(r, C0)) / 2 + 1e-9)
            t = rng.uniform(-2, 2)
            self.assertAlmostEqual(cost([x + t for x in q], C0), cost(q, C0) + t, places=8)
            lam = rng.uniform(.5, 3)
            self.assertAlmostEqual(solve_C([lam * x for x in q], lam * C0), lam * solve_C(q, C0), places=8)
        self.assertAlmostEqual(cost([0, 0, 0], C0), 0.0, places=9)

    def test_worst_case_loss_below_C0_and_approaches(self):
        C0 = 10.0
        for n in (2, 3, 4):
            vals = [worst_case_loss([s] + [0.0] * (n - 1), C0, 0) for s in (1, 10, 1e3, 1e4)]
            self.assertTrue(all(v < C0 for v in vals))
            self.assertTrue(all(b > a for a, b in zip(vals, vals[1:])))
            self.assertGreater(vals[-1], C0 * (1 - 1e-3))
        rng = random.Random(3)
        for _ in range(200):
            q = [rng.uniform(0, 500) for _ in range(3)]
            self.assertLess(worst_case_loss(q, C0, rng.randrange(3)), C0)

    def test_binary_closed_forms(self):
        C0 = 3.0
        for p in (.6, .8, .95, .99):
            s = binary_shares_to_price(p, C0)
            q = [s, 0.0]
            self.assertAlmostEqual(prices(q, C0)[0], p, places=9)
            self.assertAlmostEqual(cost(q, C0), binary_cost_to_price(p, C0), places=8)
            self.assertAlmostEqual(informed_cost([p, 1 - p], C0), binary_cost_to_price(p, C0), places=9)

    def test_informed_profit_is_optimal_and_closed_form(self):
        C0 = 5.0
        pi = [.5, .3, .2]
        best = max(sum(pi[o] * qo for o, qo in enumerate(q)) - cost(q, C0)
                   for q in ([a, b, 0.0] for a in [x * .25 for x in range(0, 60)] for b in [y * .25 for y in range(0, 60)]))
        # q with min 0 covers every trade up to a shift; grid is coarse so grid <= closed form, and close
        self.assertLessEqual(best, informed_profit(pi, C0) + 1e-9)
        self.assertGreater(best, informed_profit(pi, C0) - 0.02)
        # exact: trade to the price vector pi, profit computed from the cost function
        r = [1 / x for x in pi]; c = C0 * math.prod(pi) ** (1 / 3)
        C = c / min(pi); q = [C - c / x for x in pi]
        self.assertAlmostEqual(min(q), 0.0, places=9)
        self.assertAlmostEqual(sum(a * b for a, b in zip(pi, q)) - cost(q, C0), informed_profit(pi, C0), places=8)
        self.assertAlmostEqual(prices(q, C0)[0], pi[0], places=9)

    def test_uniform_belief_earns_nothing_certainty_earns_C0(self):
        C0 = 4.0
        self.assertAlmostEqual(informed_profit([.25] * 4, C0), 0.0, places=12)
        self.assertGreater(informed_profit([1 - 3e-9, 1e-9, 1e-9, 1e-9], C0), C0 * .99)

    def test_matches_lmsr_ordering_and_tail(self):
        # equal worst-case loss: b = C0/ln n; both are bounded by that loss
        C0 = 10.0
        for pi in ([.9, .1], [.6, .4], [.99, .01]):
            self.assertLess(informed_profit(pi, C0), C0)
            self.assertLess(lmsr_informed_profit(pi, C0 / math.log(2)), C0 + 1e-12)
        # polynomial vs exponential laggard tail
        C0 = 10.0; b = C0 / math.log(2)
        for gap in (300.0, 1000.0):
            pc = laggard_price(gap, 2, C0); pl = lmsr_prices([0.0, -gap], b)[1]
            self.assertGreater(pc, pl * 1e3)
            self.assertAlmostEqual(pc * (gap / C0) ** 2, 1.0, delta=0.05)     # (C0/gap)^n law, n = 2

    def test_regret_identity(self):
        rng = random.Random(4); C0 = 6.0
        gains = [[rng.random() for _ in range(3)] for _ in range(300)]
        reg, settle, sumD = regret_decomposition(gains, C0)
        self.assertAlmostEqual(reg, settle + sumD, places=6)
        self.assertLessEqual(settle, C0)
        self.assertGreaterEqual(sumD, -1e-9)
        got, best, _ = routing_regret("cfmm", C0, gains)
        self.assertAlmostEqual(best - got, reg, places=6)

    def test_near_uniform_ratio_is_ln_n(self):
        # locally the CFMM concedes ln(n) times what LMSR concedes at equal worst-case loss (crossover at n = e)
        for n in (2, 3, 4, 8):
            e = 1e-4; pi = [1 / n + (e if i % 2 == 0 else -e) * (1 if n % 2 == 0 or i < n - 1 else 0) for i in range(n)]
            pi = [x / sum(pi) for x in pi]
            ratio = informed_profit(pi, 1.0) / lmsr_informed_profit(pi, 1 / math.log(n))
            self.assertAlmostEqual(ratio, math.log(n), delta=2e-3)

    def test_lmsr_baseline_sane(self):
        b = 5.0; q = [3.0, 1.0, 0.0]
        p = lmsr_prices(q, b); self.assertAlmostEqual(sum(p), 1.0)
        self.assertAlmostEqual(lmsr_cost([0, 0], b), 0.0, places=12)
        self.assertAlmostEqual(lmsr_cost([400, 0], b) - 400, -b * math.log(2), delta=1e-6)


if __name__ == "__main__":
    unittest.main()
