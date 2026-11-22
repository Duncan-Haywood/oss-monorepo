import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_robustmove import spikes, failed, run_move, MOVES

KW = dict(betas=(1, 8), iters_per_beta=3)


class T(unittest.TestCase):
    def test_spikes_flat_history(self):
        self.assertEqual(spikes([5.0, 5.1, 4.9, 5.0])[0], 0)

    def test_spikes_counts_a_jump(self):
        n, m = spikes([200.0, 210.0, 9000.0, 300.0, 3000.0])
        self.assertEqual(n, 2)
        self.assertAlmostEqual(m, 9000.0 / 210.0)

    def test_failed_threshold(self):
        self.assertFalse(failed(290.0, 200.0))
        self.assertTrue(failed(310.0, 200.0))

    def test_moves_start_at_earlier_default(self):
        self.assertEqual(MOVES[0], 0.2)
        self.assertEqual(list(MOVES), sorted(MOVES, reverse=True))

    def test_deterministic_and_eroded_not_better(self):
        a = run_move(24, 8, 2.0, 0.1, **KW)
        b = run_move(24, 8, 2.0, 0.1, **KW)
        self.assertEqual(a["c_b"], b["c_b"])
        self.assertGreaterEqual(a["c_e"], a["c_d"])
        self.assertEqual(len(a["history"]), 6)

    def test_move_changes_trajectory(self):
        a = run_move(24, 8, 2.0, 0.2, **KW)
        b = run_move(24, 8, 2.0, 0.05, **KW)
        self.assertNotEqual(a["c_b"], b["c_b"])

    def test_pinned_small_run(self):
        # 2026-11-22 quality audit: changing the evaluation penalty (3.0) or returning the eroded
        # value as c_b left every test green. Pin one small run's three compliances (values from
        # this code on 2026-11-22; the 60x20 rows were checked against an independent Q4 solver).
        a = run_move(24, 8, 2.0, 0.1, **KW)
        self.assertAlmostEqual(a["c_e"], 6038.986682138484, places=6)
        self.assertAlmostEqual(a["c_b"], 780.5471740538965, places=6)
        self.assertAlmostEqual(a["c_d"], 236.41598482658148, places=6)


if __name__ == "__main__":
    unittest.main()
