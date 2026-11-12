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
        self.assertAlmostEqual(vb, 7.190, delta=0.001)
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

    # Quality audit 2026-11-12 (portfolio/quality/audits/2026-11-12-osrobot-weedsrc.json): the on-the-move kill
    # and time path behind every headline number was untested; inverting TREAT_OK left all tests green.
    def _fitted(self, **kw):
        p_max, vb = M.fit_detector()
        old = M.V_BLUR
        M.V_BLUR = vb
        try:
            runs = [M.run_passes(M.Field(s, density=kw.get("density", 1.0)),
                                 random.Random(s), p_max=p_max, v=kw.get("v", 2 * KMH), on_move=True,
                                 passes=kw.get("passes", 1), hidden_share=kw.get("hidden", 0.0)) for s in range(20)]
            return runs, M.p_detect(p_max, kw.get("v", 2 * KMH))
        finally:
            M.V_BLUR = old

    def test_kill_share_matches_closed_form(self):
        # each pass detects a live weed with p(v) and kills it with TREAT_OK, independently: 1 - (1 - p*0.992)^n
        for n in (1, 2):
            runs, pd = self._fitted(passes=n)
            kill = sum(r["kill"] for r in runs) / len(runs)
            self.assertAlmostEqual(kill, 1 - (1 - pd * M.TREAT_OK) ** n, delta=0.01)

    def test_hidden_weeds_cap_the_kill(self):
        runs, _ = self._fitted(passes=3, hidden=0.3)
        kill = sum(r["kill"] for r in runs) / len(runs)
        self.assertLess(kill, 0.72)
        self.assertGreater(kill, 0.66)

    def test_laser_queue_sets_lane_time_at_high_density(self):
        # README: one pass at 2 km/h takes 34.1 min at 0.3 weeds/m2 and 61.4 min at 3 weeds/m2
        lo, _ = self._fitted(density=0.3)
        hi, _ = self._fitted(density=3.0)
        t_lo = sum(r["time_min"] for r in lo) / len(lo)
        t_hi = sum(r["time_min"] for r in hi) / len(hi)
        self.assertAlmostEqual(t_lo, 34.1, delta=1.0)
        self.assertAlmostEqual(t_hi, 61.4, delta=2.0)


if __name__ == "__main__":
    unittest.main()
