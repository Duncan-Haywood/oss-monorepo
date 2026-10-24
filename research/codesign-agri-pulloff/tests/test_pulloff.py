import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_agri_pulloff import pulloff as P
from codesign_agri import agri as G


class PulloffTests(unittest.TestCase):
    def test_base_median_reproduces_parent_population(self):
        a, b = P.population(P.BASE_MEDIAN), G.POP
        for k in a:
            np.testing.assert_array_equal(a[k], b[k])

    def test_only_pulloff_changes(self):
        a, b = P.population(10.0), G.POP
        for k in a:
            if k != "fd":
                np.testing.assert_array_equal(a[k], b[k])
        self.assertGreater(np.median(a["fd"]), 2 * np.median(b["fd"]))

    def test_median_scales_lognormal(self):
        r = np.median(P.population(7.0)["fd"]) / np.median(P.population(3.5)["fd"])
        self.assertAlmostEqual(r, 2.0, delta=0.05)

    def test_stronger_stems_slip_more_at_fixed_design(self):
        x = [25, 26, 0.19, 8.0, 3]
        self.assertLess(P.make_evaluate(3.17)(x)["slipped"], P.make_evaluate(13.94)(x)["slipped"])

    def test_grip_bound_moves(self):
        old = P.O._UB[3]
        try:
            P.set_grip_bound(10.0)
            self.assertEqual(P.O._phys(np.ones(5))[3], 10.0)
        finally:
            P.set_grip_bound(old)


if __name__ == "__main__":
    unittest.main()
