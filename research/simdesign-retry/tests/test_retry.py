import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_retry import run_retry, robust_retry

KW = dict(betas=(1, 8), iters_per_beta=3)


class T(unittest.TestCase):
    def test_no_spike_threshold_equals_fixed_move(self):
        a = run_retry(24, 8, 2.0, spike=float("inf"), **KW)
        from simdesign_robustadapt import run_rule, fixed
        b = run_rule(24, 8, 2.0, fixed(0.2), **KW)
        self.assertAlmostEqual(a["c_b"], b["c_b"], places=6)
        self.assertEqual(a["rejects"], 0)
        self.assertEqual(a["evals"], 6)

    def test_deterministic(self):
        a = run_retry(24, 8, 2.0, spike=1.0, **KW)
        b = run_retry(24, 8, 2.0, spike=1.0, **KW)
        self.assertEqual(a["c_b"], b["c_b"])

    def test_forced_rejects_halve_move_with_floor_and_cap(self):
        r = robust_retry(24, 8, 2.0, spike=0.0, mmin=0.05, max_retry=5, **KW)  # every step "spikes"
        self.assertGreater(r["rejects"], 0)
        self.assertTrue(all(m >= 0.05 for m in r["moves"]))
        self.assertTrue(all(m <= 0.2 for m in r["moves"]))
        self.assertEqual(r["evals"], len(r["history"]) + r["rejects"])
        self.assertEqual(len(r["history"]), 6)

    def test_default_rule_runs_to_full_length(self):
        r = robust_retry(24, 8, 2.0, spike=3.0, **KW)
        self.assertEqual(len(r["history"]), 6)
