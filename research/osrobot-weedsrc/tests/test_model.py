import math, random, unittest
from osrobot_weedsrc import model as M

KMH = 1 / 3.6


class T(unittest.TestCase):
    def test_fit_passes_through_both_points(self):
        p_max, vb = M.fit_detector()
        for v, p in M.DETECT_POINTS:
            self.assertAlmostEqual(p_max * math.exp(-v / vb), p, places=9)

    def test_fit_values(self):
        p_max, vb = M.fit_detector()
        self.assertAlmostEqual(vb, 7.17, delta=0.05)
        self.assertAlmostEqual(p_max, 0.914, delta=0.002)

    def test_flat_detector_when_points_equal_rate_is_rejected(self):
        with self.assertRaises(ZeroDivisionError):
            M.fit_detector(((0.2, 0.9), (0.4, 0.9)))

    def test_better_detector_kills_more(self):
        def kill(pm):
            return sum(M.run_passes(M.Field(s, density=1.0), random.Random(s), passes=1, p_max=pm, v=2 * KMH, on_move=True)["kill"] for s in range(5))
        self.assertGreater(kill(0.9), kill(0.5))

    def test_reproducible(self):
        a = M.run_passes(M.Field(1), random.Random(1), passes=2, v=KMH, on_move=True)
        self.assertEqual(a, M.run_passes(M.Field(1), random.Random(1), passes=2, v=KMH, on_move=True))

    def test_more_passes_more_kill(self):
        a = M.run_passes(M.Field(2, density=1.0), random.Random(2), passes=1, v=KMH, p_max=0.9)
        b = M.run_passes(M.Field(2, density=1.0), random.Random(2), passes=3, v=KMH, p_max=0.9)
        self.assertGreater(b["kill"], a["kill"])


if __name__ == "__main__":
    unittest.main()
