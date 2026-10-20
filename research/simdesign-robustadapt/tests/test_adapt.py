import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_robustadapt import MoveRule, fixed, run_rule

KW = dict(betas=(1, 8), iters_per_beta=3)


class T(unittest.TestCase):
    def test_fixed_never_changes(self):
        r = fixed(0.1)
        for prev, cur in [(1, 100), (100, 1), (None, 5)]:
            self.assertEqual(r.update(prev, cur), 0.1)

    def test_adaptive_halves_on_spike_with_floor(self):
        r = MoveRule(0.2, adaptive=True, mmin=0.05)
        self.assertEqual(r.update(10.0, 50.0), 0.1)
        self.assertEqual(r.update(50.0, 400.0), 0.05)
        self.assertEqual(r.update(400.0, 4000.0), 0.05)

    def test_adaptive_recovers_after_calm_but_not_above_start(self):
        r = MoveRule(0.2, adaptive=True, calm=2, grow=2.0)
        r.update(1.0, 10.0)
        self.assertEqual(r.move, 0.1)
        r.update(10, 10); self.assertEqual(r.move, 0.1)
        r.update(10, 10); self.assertEqual(r.move, 0.2)
        r.update(10, 10); r.update(10, 10); self.assertEqual(r.move, 0.2)

    def test_run_deterministic_and_fixed_matches_robust(self):
        a = run_rule(24, 8, 2.0, fixed(0.2), **KW)
        b = run_rule(24, 8, 2.0, fixed(0.2), **KW)
        self.assertEqual(a["c_b"], b["c_b"])
        from simdesign_robustmove import run_move
        c = run_move(24, 8, 2.0, 0.2, **KW)
        self.assertAlmostEqual(a["c_b"], c["c_b"], places=6)
        self.assertEqual(len(a["moves"]), 6)
