"""LP contract tests: closed form of audit.threshold, brute force, and the joint-signal ordering."""
import unittest

try:
    import numpy as np
    from vtm.contract import brute_force_two_signal, optimal_contract
    from vtm.audit import threshold
    HAVE = True
except ImportError:
    HAVE = False


@unittest.skipUnless(HAVE, "numpy or scipy missing")
class ContractTests(unittest.TestCase):
    def test_audit_only_cost_and_threshold(self):
        # honest costs C, cheating costs 0 (gain g = C); audit catches a cheater w.p. p.
        # IC: p (w + S) >= C, IR: w >= C, so the cheapest pay is max(C, C/p - S): rent-free exactly at
        # p >= audit.threshold(C, S) = C / (C + S).
        C, S = 1.0, 4.0
        for p in (0.05, 0.1, 0.19, 0.2, 0.3, 0.9):
            cost, _ = optimal_contract([[1, 0], [1 - p, p]], [C, 0.0], stake=S)
            self.assertAlmostEqual(cost, max(C, C / p - S), places=6)
            self.assertEqual(cost <= C + 1e-9, p >= threshold(C, S) - 1e-12)

    def test_lp_equals_brute_force(self):
        rng = np.random.default_rng(0)
        for _ in range(12):
            ph, pc = 1.0, rng.uniform(0.1, 0.9)
            ch, cc, S = 1.0, rng.uniform(0, 0.8), rng.uniform(0.2, 3)
            cost, _ = optimal_contract([[ph, 1 - ph], [pc, 1 - pc]], [ch, cc], stake=S)
            bf = brute_force_two_signal((ph, pc), cc, ch, S, grid=2500)
            self.assertAlmostEqual(cost, bf, delta=0.01 * (1 + bf))

    def test_more_signals_never_cost_more(self):
        # coarsening a signal (merging columns) can only raise the minimum cost
        rng = np.random.default_rng(1)
        for _ in range(10):
            P = rng.dirichlet(np.ones(6), size=3)
            c = [1.0, 0.5, 0.2]
            fine, _ = optimal_contract(P, c, stake=2.0)
            Pc = np.stack([P[:, 0] + P[:, 1], P[:, 2] + P[:, 3], P[:, 4] + P[:, 5]], 1)
            coarse, _ = optimal_contract(Pc, c, stake=2.0)
            self.assertLessEqual(fine, coarse + 1e-7)
