import random, unittest
from osrobot_fieldreal import model as M


class T(unittest.TestCase):
    def test_sourced_constants(self):
        self.assertEqual(M.SWATH, 2.0); self.assertEqual(M.TREAT_S, 0.73); self.assertEqual(M.TREAT_OK, 0.992)

    def test_lanes_cover_field_with_wide_swath(self):
        ls = M.lanes(30.0, 0.0)
        self.assertAlmostEqual(ls[0], 1.0); self.assertAlmostEqual(ls[-1], 29.0)
        self.assertLessEqual(max(b - a for a, b in zip(ls, ls[1:])), M.SWATH + 1e-9)

    def test_field_reproducible(self):
        self.assertEqual(M.Field(3).weeds, M.Field(3).weeds)

    def test_time_never_beats_source_ceiling(self):
        # 2 km/h x 2 m = 0.4 ha/h upper bound on any run at 2 km/h
        F = M.Field(1, density=0.3); res = M.run_inline(F, random.Random(1), v=2 / 3.6)
        ha_h = (60 * 30 / 1e4) / (res["time_min"] / 60)
        self.assertLess(ha_h, 0.40)

    def test_perfect_sensor_nearly_clears_field(self):
        F = M.Field(2, density=0.3, mud=0.0); res = M.run_inline(F, random.Random(2), p_max=1.0, fp_rate=0.0, v=0.1)
        self.assertGreater(res["kill"], 0.8)

    def test_more_density_more_time(self):
        a = M.run_inline(M.Field(4, density=0.3), random.Random(4), v=0.3)
        b = M.run_inline(M.Field(4, density=3.0), random.Random(4), v=0.3)
        self.assertGreater(b["time_min"], a["time_min"])


if __name__ == "__main__":
    unittest.main()
