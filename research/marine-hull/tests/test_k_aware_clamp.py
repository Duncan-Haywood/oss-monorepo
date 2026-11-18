import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_k_aware_clamp as K  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_level_season as L  # noqa: E402
import run_multi_season_clamp as M  # noqa: E402


class KAwareClampTests(unittest.TestCase):
    def setUp(self):
        fy.load()

    def test_band_points(self):
        band = [p for p in bt.PTS if K.in_band(p)]
        self.assertEqual(len(band), 9)
        self.assertIn("North-Sea", band)
        self.assertNotIn("Gulf-of-Maine", band)
        self.assertEqual([p for p in ls.high_amp_points() if not K.in_band(p)], ["P-30"])

    def test_ak_scales_ap_by_sqrt_k(self):
        r = (1.0,) * 6 + (1.08,) * 6  # spread 0.04
        self.assertAlmostEqual(K.half_width("AP", r, 1.0, 3), 0.04)
        self.assertAlmostEqual(K.half_width("AK", r, 1.0, 3), 0.04 * math.sqrt(3))
        self.assertAlmostEqual(K.half_width("AK", (1.0,) * 12, 1.0, 2), 0.02)  # floor
        self.assertAlmostEqual(K.half_width("AK", (1.5,) * 12, 1.5, 3), 0.40)  # ceiling

    def test_ap_and_c15_match_6zzz(self):
        a = K.corrections("P+60", "L", L.REAL)
        b = M.corrections("P+60", "L", L.REAL)
        for k in K.KS:
            for s in K.SETS[k]:
                for t in ("AP", "C15"):
                    self.assertEqual(a[K.rname(t, s)], b[M.rname(t, s)])

    def test_ab_is_assembled_from_ap_or_c15(self):
        fy.prepare()
        for p, src in (("P+60", "C15"), ("P-30", "AP")):
            key = ("nasa", K.PACKS[1], p, K.YEARS[3]) + K.SHAPES[0]
            out = K.score(key)[1]
            for s in K.SETS[3]:
                self.assertEqual(out[K.rname("AB", s)], out[K.rname(src, s)])


if __name__ == "__main__":
    unittest.main()
