import random, unittest
from osrobot_field import model as M


class T(unittest.TestCase):
    def test_lane_coverage_and_spacing(self):
        for ov in (0.0, 0.25, 0.5):
            ls = M.lanes(30.0, ov)
            self.assertAlmostEqual(ls[0], M.SWATH / 2); self.assertAlmostEqual(ls[-1], 30.0 - M.SWATH / 2)
            self.assertLessEqual(max(b - a for a, b in zip(ls, ls[1:])), M.SWATH * (1 - ov) + 1e-9)
        self.assertGreater(len(M.lanes(30.0, 0.5)), len(M.lanes(30.0, 0.0)))

    def test_field_reproducible_and_density(self):
        a, b = M.Field(3), M.Field(3)
        self.assertEqual(a.weeds, b.weeds)
        n = [len(M.Field(s, density=0.3).weeds) for s in range(30)]
        self.assertAlmostEqual(sum(n) / len(n) / (60 * 30), 0.3, delta=0.06)  # edge loss lowers it a little

    def test_detection_falls_with_speed(self):
        self.assertGreater(M.p_detect(0.8, 0.5), M.p_detect(0.8, 3.0))
        self.assertAlmostEqual(M.p_detect(0.8, 0.0), 0.8)

    def test_mud_costs_time_and_energy(self):
        f = M.Field(1, mud=0.0); g = M.Field(1, mud=1.0)
        a, b = M.Meter(f), M.Meter(g)
        a.move(0, 0, 40, 0, 1.0); b.move(0, 0, 40, 0, 1.0)
        self.assertAlmostEqual(a.t, 40.0); self.assertAlmostEqual(b.t, 40.0 / M.MUD_V)
        self.assertAlmostEqual(b.e / a.e, M.MUD_E)

    def test_perfect_sensor_kill_tracks_treat_ok(self):
        ks = [M.run_inline(M.Field(s), random.Random(s), p_max=1.0, fp_rate=0.0, v=0.05)["kill"] for s in range(5)]
        self.assertAlmostEqual(sum(ks) / 5, M.TREAT_OK, delta=0.04)

    def test_overlap_raises_kill(self):
        def kill(ov):
            return sum(M.run_inline(M.Field(s), random.Random(s), p_max=0.5, fp_rate=0.0, v=0.5, overlap=ov)["kill"] for s in range(6)) / 6
        self.assertGreater(kill(0.5), kill(0.0))

    def test_scout_accounting(self):
        r = M.run_scout(M.Field(2), random.Random(2), p_max=0.9, fp_rate=0.0, v_scout=0.5)
        self.assertEqual(r["wasted"], r["treatments"] - round(r["kill"] * r["weeds"]))
        self.assertLessEqual(r["treatments"], r["weeds"])


if __name__ == "__main__":
    unittest.main()
