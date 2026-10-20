import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_loadrobust import angled_cantilever, multiload_simp, compliance_at, angle_sweep


class T(unittest.TestCase):
    def test_load_is_unit_and_directed(self):
        for a in (0, 30, 90, -45):
            f, fixed = angled_cantilever(a)(8, 4)
            self.assertAlmostEqual(float(np.linalg.norm(f)), 1.0, places=12)
            self.assertEqual(int(np.sum(np.abs(f) > 1e-9)), 2 if a not in (0, 90) else 1)
        f, _ = angled_cantilever(90)(8, 4)
        self.assertGreater(f[np.abs(f) > 1e-9][0], 0)  # +x component

    def test_reversed_load_same_compliance(self):
        x = np.random.default_rng(0).uniform(0.3, 1, (6, 12))
        self.assertAlmostEqual(compliance_at(x, 40), compliance_at(x, 40 + 0.0), places=12)
        # linear elasticity: compliance is quadratic in the load, f and -f agree
        f, fixed = angled_cantilever(40)(12, 6)
        from simdesign_topopt import fe_compliance
        self.assertAlmostEqual(fe_compliance(x, 12, 6, f, fixed)[0], fe_compliance(x, 12, 6, -f, fixed)[0], places=10)

    def test_volume_and_single_load_matches_topopt(self):
        from simdesign_topopt import simp, cantilever_problem
        r = multiload_simp(16, 8, 0.4, 3.0, 1.2, [0.0], max_iter=30)
        s = simp(16, 8, 0.4, 3.0, 1.2, cantilever_problem, max_iter=30)
        self.assertAlmostEqual(float(r["x"].mean()), 0.4, places=3)
        self.assertTrue(np.allclose(r["x"], s["x"], atol=1e-6))

    def test_multiload_beats_nominal_off_nominal(self):
        nom = multiload_simp(24, 12, 0.4, 3.0, 1.2, [0.0], max_iter=60)["x"]
        rob = multiload_simp(24, 12, 0.4, 3.0, 1.2, [-60.0, 0.0, 60.0], max_iter=60)["x"]
        self.assertLess(compliance_at(rob, 60.0), compliance_at(nom, 60.0))
        self.assertLessEqual(compliance_at(nom, 0.0), compliance_at(rob, 0.0))

    def test_sweep_shape(self):
        x = np.full((6, 12), 0.5)
        self.assertEqual(angle_sweep(x, [0, 45, 90]).shape, (3,))


if __name__ == "__main__":
    unittest.main()
