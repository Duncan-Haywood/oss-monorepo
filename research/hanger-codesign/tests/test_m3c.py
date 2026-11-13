"""Milestone 3c: the seed chains, the discordant cases and the smallest-eigenvalue check."""
import importlib.util
import sys
import unittest
from pathlib import Path

import numpy as np

EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP / "m3_fem_tier"))

spec = importlib.util.spec_from_file_location("m3c_run", EXP / "m3c_branches" / "run.py")
m3c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m3c)


class TestM3c(unittest.TestCase):
    def test_chains_start_soft_rise_and_end_at_the_top_sourced_value(self):
        for f, ch in m3c.CHAIN.items():
            self.assertEqual(ch[0], 150.0)
            self.assertEqual(list(ch), sorted(ch))
            self.assertEqual(ch[-1], m3c.TOP[f])
            for ea in m3c.SOURCED[f]:
                self.assertIn(ea, ch)

    def test_discordant_cases_lie_on_3b_chains(self):
        self.assertEqual(len(m3c.DISC), 4)
        for f, ea, a in m3c.DISC:
            self.assertIn(ea, m3c.CHAIN3B[f])
            self.assertIn(a, (0.0075, 0.005, 0.00375, 0.0025))

    def test_seed_zero_start_is_3a_start_and_seeds_differ(self):
        sp = m3c.m3.Disc("A", 150.0, 0.02, "kes")
        x0, x0b, x1 = sp.start(0), sp.start(0), sp.start(1)
        np.testing.assert_array_equal(x0, x0b)
        self.assertGreater(np.abs(x0 - x1).max(), 0.0)
        np.testing.assert_array_equal(x1[sp.fixed, 2], 0.0)

    def test_converged_coarse_drape_is_a_minimum(self):
        sp, nw, w = m3c.setup("D", 800.0, 0.015)
        X, info = m3c.stage(sp, nw, w, sp.start(0))
        self.assertLess(info["gmax"], 1e-5 * w)
        self.assertGreater(m3c.lam_min(sp, nw, X), 0.0)

    def test_sd_is_sample_sd_and_zero_for_one_value(self):
        self.assertEqual(m3c.sd([0.3]), 0.0)
        self.assertAlmostEqual(m3c.sd([1.0, 2.0, 3.0]), 1.0)


if __name__ == "__main__":
    unittest.main()
