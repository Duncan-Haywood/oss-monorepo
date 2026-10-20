import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_sensitivity.sobol import NAMES, build, elasticity, sobol

SP = {"print_rate": 2, "assembly_h": 2, "vit_cost": 2, "budget": 2}


class Sens(unittest.TestCase):
    def test_build_matches_free_doubling(self):
        # huge budget, no failures: effective doubling = W ln2 ... fluid is exactly W per e-fold
        t = build([25, 6, 170, 1e9, 0.0], 1100)
        self.assertAlmostEqual(t, 50 * math.log(2), places=6)

    def test_import_limited_elasticities(self):
        base = [25, 6, 170, 0.5, 0.1]
        e = [elasticity(base, 1100, i) for i in range(5)]
        self.assertAlmostEqual(e[2], 1.0, places=3)    # vitamin cost
        self.assertAlmostEqual(e[3], -1.0, places=3)   # budget
        self.assertAlmostEqual(e[4], -1.0, places=3)   # ln(1-fail)
        self.assertAlmostEqual(e[0], 0.0, places=3)

    def test_log_additive_model_has_sum_one_and_exact_split(self):
        # budget-limited and budget-only variation: ln T is linear in ln budget, so S1 = ST = 1
        base = [25, 6, 170, 0.5, 0.0]
        sp = {"print_rate": 1.0001, "assembly_h": 1.0001, "vit_cost": 1.0001, "budget": 4}
        r = sobol(base, sp, 1100, fail_max=1e-9, n=2000, log_output=True)
        self.assertGreater(r["budget"][0], 0.99)
        self.assertLess(r["print_rate"][1], 0.01)

    def test_indices_bounded_and_deterministic(self):
        base = [25, 6, 170, 4, 0.25]
        a = sobol(base, SP, 1100, n=500, log_output=True)
        b = sobol(base, SP, 1100, n=500, log_output=True)
        self.assertEqual(a, b)
        self.assertEqual(set(a), set(NAMES))
        for s1, st in a.values():
            self.assertLess(s1, st + 0.15)  # estimator noise allowed


if __name__ == "__main__":
    unittest.main()
