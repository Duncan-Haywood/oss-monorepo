import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_robustradius import run_case, CASES

KW = dict(betas=(1, 8), iters_per_beta=4)


class T(unittest.TestCase):
    def test_cases_cover_grid(self):
        self.assertEqual(len(CASES), 9)
        self.assertIn((4.0, 0.0), CASES)

    def test_case_fields(self):
        r = run_case(24, 8, 2.0, 0.1, **KW)
        for k in ("c_e", "c_b", "c_d", "grey", "ms", "mv", "bp"):
            self.assertIn(k, r)
        self.assertGreaterEqual(r["c_e"], r["c_d"])
        self.assertTrue(0.0 <= r["grey"] <= 1.0)

    def test_deterministic(self):
        a = run_case(18, 6, 1.5, 0.2, **KW); b = run_case(18, 6, 1.5, 0.2, **KW)
        self.assertTrue(np.array_equal(a["bp"], b["bp"]))


if __name__ == "__main__":
    unittest.main()
