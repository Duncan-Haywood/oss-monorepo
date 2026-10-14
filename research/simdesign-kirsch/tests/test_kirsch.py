import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_kirsch import kirsch_stress, solve


class T(unittest.TestCase):
    def test_exact_peak_is_three_sigma(self):
        sxx, syy, sxy = kirsch_stress(np.array(1e-12), np.array(1.0), a=1.0, sigma=2.0)
        self.assertAlmostEqual(float(sxx), 6.0, places=6)

    def test_hole_edge_is_traction_free(self):
        th = np.linspace(0.1, 1.5, 7)
        x, y = np.cos(th), np.sin(th)
        sxx, syy, sxy = kirsch_stress(x, y)
        tx, ty = sxx * x + sxy * y, sxy * x + syy * y
        self.assertLess(np.abs(tx).max(), 1e-12)
        self.assertLess(np.abs(ty).max(), 1e-12)

    def test_far_field_is_uniaxial(self):
        sxx, syy, sxy = kirsch_stress(np.array(1e4), np.array(1e-3))
        self.assertAlmostEqual(float(sxx), 1.0, places=3)
        self.assertAlmostEqual(float(syy), 0.0, places=3)

    def test_vertex_peak_close_and_centroid_peak_below_exact(self):
        r = solve(16)
        self.assertLess(abs(r["peak_vertex"] - 3.0) / 3.0, 0.01)
        self.assertLess(r["peak_centroid"], 3.0)

    def test_centroid_error_shrinks_with_refinement(self):
        a, b = solve(8), solve(16)
        self.assertLess(3 - b["peak_centroid"], 0.6 * (3 - a["peak_centroid"]))
        self.assertLess(b["rel_l2_vm"], a["rel_l2_vm"] / 3)

    def test_fe_matches_exact_at_the_sampled_centroid(self):
        r = solve(16)
        self.assertLess(abs(r["peak_centroid"] - r["exact_at_peak_centroid"]), 0.01)


if __name__ == "__main__":
    unittest.main()
