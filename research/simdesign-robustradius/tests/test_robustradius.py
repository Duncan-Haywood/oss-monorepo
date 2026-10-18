import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_robustradius import run_case

KW = dict(betas=(1, 8), iters_per_beta=4)


class T(unittest.TestCase):
    def test_zero_gap_robust_equals_heaviside(self):
        a = run_case(18, 6, 1.5, "robust", d_eta=0.0, **KW)
        b = run_case(18, 6, 1.5, "heaviside", d_eta=0.0, **KW)
        self.assertTrue(np.allclose(a["blueprint"], b["blueprint"], atol=1e-9))
        self.assertAlmostEqual(a["c_b"], b["c_b"], places=8)

    def test_measures_sane_and_deterministic(self):
        a = run_case(24, 8, 2.0, "robust", **KW); b = run_case(24, 8, 2.0, "robust", **KW)
        self.assertTrue(np.array_equal(a["blueprint"], b["blueprint"]))
        self.assertGreaterEqual(a["c_e"], a["c_d"])
        self.assertGreaterEqual(a["ms"], 1); self.assertGreaterEqual(a["mv"], 1)
        self.assertTrue(0 <= a["grey"] <= 1)

    def test_bad_formulation(self):
        with self.assertRaises(ValueError):
            run_case(12, 4, 1.5, "nope")


if __name__ == "__main__":
    unittest.main()
