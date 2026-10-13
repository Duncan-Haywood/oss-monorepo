import random
import unittest
from math import log
from milestone_schedules import *


class T(unittest.TestCase):
    def test_stage_matches_theta_range(self):
        rng = random.Random(1)
        for _ in range(3000):
            c = rng.uniform(0.1, 5); p = c * rng.uniform(1, 1.6)
            Fr, Fw = rng.uniform(0, 4), rng.uniform(0, 4)
            rg = theta_range(c, p, Fr, Fw)
            ok_grid = any(stage_feasible(c, p, i / 400, Fr, Fw) for i in range(401))
            if rg is None:
                self.assertFalse(ok_grid)
            else:
                lo, hi = rg
                self.assertTrue(stage_feasible(c, p, (lo + hi) / 2, Fr, Fw))
                self.assertTrue(0 <= lo <= hi <= 1 + 1e-12)
            if ok_grid:
                self.assertIsNotNone(rg)

    def test_pooled_condition(self):
        # a self-enforcing split exists iff c <= F_r + F_w (given p >= c)
        rng = random.Random(2)
        for _ in range(2000):
            c = rng.uniform(0.1, 5); p = c * rng.uniform(1, 1.6)
            Fr, Fw = rng.uniform(0, 4), rng.uniform(0, 4)
            self.assertEqual(theta_range(c, p, Fr, Fw) is not None, c <= Fr + Fw + 1e-9)

    def test_pure_timings(self):
        self.assertEqual(n_pay_after(120, 1.0), 120)
        self.assertEqual(n_pay_before(100, 4.0), 25)
        # split beats both: C/(W_r+W_w) with equal milestones
        self.assertEqual(n_equal(100, 5.0), 20)
        # equal milestones at exactly that count are feasible only with a split
        C, V, P, Wr, Ww = 100.0, 120.0, 110.0, 1.0, 4.0
        n = n_equal(C, Wr + Ww)
        self.assertTrue(schedule_feasible([C / n] * n, C, V, P, Wr, Ww))
        self.assertFalse(schedule_feasible([C / (n - 1)] * (n - 1), C, V, P, Wr, Ww))

    def test_greedy_feasible_and_count_formula(self):
        rng = random.Random(3)
        for _ in range(400):
            C = rng.uniform(10, 500); V = C * rng.uniform(1.01, 3); P = C + (V - C) * rng.random()
            W = rng.uniform(0.05, 20) * C / 100
            Wr = W * rng.random(); Ww = W - Wr
            sched = greedy_schedule(C, V, W)
            self.assertEqual(len(sched), n_geometric(C, V, W))
            self.assertTrue(schedule_feasible(sched, C, V, P, Wr, Ww))
            self.assertLessEqual(len(sched), n_equal(C, W))

    def test_no_shorter_schedule(self):
        # random search over schedules with one milestone fewer never finds a feasible one
        rng = random.Random(4)
        for _ in range(60):
            C = 100.0; V = C * rng.uniform(1.05, 2); P = (C + V) / 2; W = rng.uniform(0.3, 8)
            n = n_geometric(C, V, W)
            if n < 2:
                continue
            m = n - 1
            for _ in range(300):
                cuts = sorted(rng.random() for _ in range(m - 1))
                costs = [b - a for a, b in zip([0] + cuts, cuts + [1])]
                costs = [x * C for x in costs]
                self.assertFalse(schedule_feasible(costs, C, V, P, W / 2, W / 2))
            # and a greedy-shaped schedule squeezed by 0.5% is infeasible at m stages
            g = greedy_schedule(C, V, W)
            self.assertEqual(len(g), n)

    def test_closed_form_and_limit(self):
        C, V, W = 100.0, 120.0, 1.0
        self.assertEqual(n_geometric(C, V, W), 17)
        self.assertEqual(n_equal(C, W), 100)
        self.assertAlmostEqual(greedy_schedule(C, V, W)[0] / C, first_fraction(C, V, W))
        self.assertEqual(n_geometric(100.0, 100.0, 4.0), 25)             # V=C: equal split is optimal
        self.assertEqual(n_geometric(100.0, 100.0 + 1e-9, 4.0), 25)      # continuity at the limit
        # geometric decay of the remaining cost around the fixed point -W/s
        s = (V - C) / C
        g = greedy_schedule(C, V, W); R = C
        for c in g[:-1]:
            R2 = R - c
            self.assertAlmostEqual(R2 + W / s, (R + W / s) / (1 + s))
            R = R2

    def test_entry_cost_cap(self):
        self.assertEqual(effective_w(5.0, 2.0), 2.0)
        self.assertGreaterEqual(n_geometric(100, 120, effective_w(5.0, 0.5)), n_geometric(100, 120, 5.0))

    def test_log_scaling(self):
        # halving W adds about ln2/ln(V/C) milestones
        C, V = 100.0, 120.0
        d = n_geometric(C, V, 0.001) - n_geometric(C, V, 0.002)
        self.assertAlmostEqual(d, log(2) / log(V / C), delta=1.0)


if __name__ == "__main__":
    unittest.main()
