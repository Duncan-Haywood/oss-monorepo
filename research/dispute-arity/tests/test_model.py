import unittest, math
from dispute_arity import *

class T(unittest.TestCase):
    def test_rounds(self):
        self.assertEqual(rounds(1024, 2), 10); self.assertEqual(rounds(1000, 10), 3); self.assertEqual(rounds(1001, 10), 4); self.assertEqual(rounds(1, 5), 0)
    def test_kstar_equation(self):
        for r in (0.5, 2, 10, 100):
            k = k_star(r); self.assertAlmostEqual(k * math.log(k) - k + 1, r, places=9)
    def test_binary_threshold(self):
        self.assertAlmostEqual(k_star(BINARY_THRESHOLD), 2.0, places=9)
    def test_kstar_minimises_continuous(self):
        a, b = 10.0, 1.0; f = lambda k: (a + b * (k - 1)) / math.log(k); ks = k_star(a / b)
        for d in (-0.3, 0.3): self.assertLess(f(ks), f(ks + d))
    def test_dispute_finds_every_corrupt_step(self):
        Tn = 97
        for j in range(Tn):
            for k in (2, 3, 5, 10):
                h, c = make_trace(Tn), make_trace(Tn, corrupt_from=j)
                (lo, hi), r, _ = dispute(h, c, k)
                self.assertEqual((lo, hi), (j, j + 1)); self.assertLessEqual(r, rounds(Tn, k))
    def test_worst_case_rounds_attained(self):
        Tn = 1000; h = make_trace(Tn)
        worst = max(dispute(h, make_trace(Tn, j), 10)[1] for j in range(Tn)); self.assertEqual(worst, 3)
    def test_dp_beats_or_matches_uniform(self):
        for T_ in (100, 1000, 5000):
            for a in (0.5, 5, 50):
                d = dp_schedule(T_, 1, a, 1.0)[0]; u = best_uniform(T_, 1, a, 1.0)[0]
                self.assertLessEqual(d, u + 1e-9)
    def test_dp_schedule_cost_consistent(self):
        cost, sched = dp_schedule(1000, 1, 7.0, 1.0); n = 1000; tot = 0
        for k in sched: tot += 7.0 + (k - 1); n = -(-n // k)
        self.assertLessEqual(n, 1); self.assertAlmostEqual(tot, cost)
    def test_leaf_tradeoff(self):
        self.assertEqual(best_leaf(4096, 5, 1, 0.0)[1], 4096)     # free re-execution -> no bisection at all
    def test_expensive_exec_forces_full_bisection(self):
        self.assertEqual(best_leaf(4096, 5, 1, 1e6)[1], 1)
if __name__ == "__main__": unittest.main()
