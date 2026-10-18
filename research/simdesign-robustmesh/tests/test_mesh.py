import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_robustmesh import radius_px, run_mesh, RADIUS_FRACTIONS

KW = dict(betas=(1, 8), iters_per_beta=3)


class T(unittest.TestCase):
    def test_radius_scales_with_mesh(self):
        for f in RADIUS_FRACTIONS:
            self.assertAlmostEqual(radius_px(180, f) / radius_px(60, f), 3.0)
        self.assertAlmostEqual(radius_px(120, 1 / 30), 4.0)

    def test_share_is_ms_over_nx(self):
        r = run_mesh(24, 8, 1 / 12, 0.2, **KW)
        self.assertAlmostEqual(r["ms_share"], r["ms"] / 24)
        self.assertGreaterEqual(r["c_e"], r["c_d"])

    def test_deterministic(self):
        a = run_mesh(18, 6, 1 / 9, 0.0, **KW); b = run_mesh(18, 6, 1 / 9, 0.0, **KW)
        self.assertEqual((a["ms"], a["mv"]), (b["ms"], b["mv"]))
        self.assertTrue((a["bp"] == b["bp"]).all())


if __name__ == "__main__":
    unittest.main()
