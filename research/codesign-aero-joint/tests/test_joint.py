import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_joint import joint as J


class JointTests(unittest.TestCase):
    def test_start_is_feasible(self):
        self.assertGreater(float(J.evaluate(np.array(J.START))[0]), -99)

    def test_infeasible_airframe_is_penalised_and_heldout_nan(self):
        x = np.array([0.0, 1.0, 0.5, 0.5, 0.5])      # small arms, huge props: overlap
        self.assertEqual(float(J.evaluate(x)[0]), -99.0)
        self.assertTrue(np.isnan(J.heldout(x)))

    def test_budget_and_determinism(self):
        a = J.run_random(64, 1); b = J.run_random(64, 1)
        self.assertTrue(np.array_equal(a[0], b[0]))
        self.assertTrue(np.all((a[0] >= 0) & (a[0] <= 1)))

    def test_cma_beats_its_start(self):
        x, best = J.run_cma(160, 0)
        self.assertGreaterEqual(best, float(J.evaluate(np.array(J.START))[0]) - 1e-9)

    def test_heldout_is_positive_rms(self):
        self.assertGreater(J.heldout(np.array(J.START)), 0)


if __name__ == "__main__":
    unittest.main()
