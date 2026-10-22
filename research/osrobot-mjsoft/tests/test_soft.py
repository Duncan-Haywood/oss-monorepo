import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
import soft  # noqa: E402
from soft import fm, layer  # noqa: E402


class T(unittest.TestCase):
    def test_force_matches_layer_law(self):
        self.assertAlmostEqual(soft.tissue_force(2e-3, 0.0, 1e4, 0.015, 0.0), layer.force(2e-3, fm.R_TIP, 1e4, 0.015), places=9)

    def test_no_force_without_penetration(self):
        self.assertEqual(soft.tissue_force(0.0, 5.0, 1e4, 0.015, 10.0), 0.0)

    def test_bone_stop_is_stiffer(self):
        h = 0.01
        self.assertGreater(soft.tissue_force(0.95 * h, 0, 1e4, h, 0) - soft.tissue_force(0.9 * h, 0, 1e4, h, 0), 40.0)

    def test_contact_geometry(self):
        pen, nx, ny = soft.lip_contact(-fm.R_TIP + 0.001, 0.0 + soft.LIPS[0][1], 0.0, 0)   # 1 mm into the front face
        self.assertAlmostEqual(pen, 0.001, places=9)
        self.assertEqual((nx, ny), (-1.0, 0.0))

    def test_steady_push_matches_law(self):
        # blind arm pushing a blocked lip at a 0.5 N cap settles where the layer law carries 0.5 N
        r = soft.run_trial(fm.Design(sense="none", v_app=0.05, f_cap=0.5), 0.0, 0, 1e4, 0.015, 10.0, offset=0.02)
        self.assertAlmostEqual(r["push"], 0.5, delta=0.05)
        self.assertAlmostEqual(r["depth"] * 0.015, layer.depth(0.5, fm.R_TIP, 1e4, 0.015), delta=5e-4)

    def test_free_approach_enters(self):
        r = soft.run_trial(fm.Design(sense="camera", v_app=0.05), 0.0, 1, 1e4, 0.015, 10.0)
        self.assertTrue(r["entered"])
        self.assertLess(r["peak"], 0.5)


if __name__ == "__main__":
    unittest.main()
