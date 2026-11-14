import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import run_fresh_years as fy  # noqa: E402
import run_seasonal_bias as sz  # noqa: E402
import run_self_bias as sb  # noqa: E402


class SeasonalBiasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fy.prepare()

    def test_scale_peaks_at_phase_and_averages_to_one(self):
        for a in sz.AMPS:
            for f in sz.PHASES:
                self.assertAlmostEqual(sz.scale(f, a, f), 1.0 + a)
                mean = sum(sz.scale(d, a, f) for d in range(365)) / 365
                self.assertAlmostEqual(mean, 1.0, delta=1e-3)
                self.assertAlmostEqual(min(sz.scale(d, a, f) for d in range(366)), 1.0 - a, delta=1e-3)

    def test_flat_shape_reproduces_6zx_at_s_one(self):
        key = (5000.0, "A+40", 2008)
        _, flat, _ = sz.score(key + (0.0, 0))
        _, ref, _ = fy.score(key + (1.0,))
        for g in ("AT_30", "AT_60", "AT_90", "OR", "PS", "PSS", sz.BASE):
            self.assertAlmostEqual(flat[g][0], ref[g][0], places=9)
            self.assertAlmostEqual(flat[g][1], ref[g][1], places=9)

    def test_oracle_follows_the_season_and_rules_cover_every_day(self):
        _, o, track = sz.score((10000.0, "P+10", 2011, 0.03, 182))
        n = 365
        real = fy.REALISED["L"]
        expect = {}
        for d in range(n):
            t = sb.tau_of(sz.scale(d, 0.03, 182) / real)
            expect[t] = expect.get(t, 0) + 1
        self.assertEqual({k: v for k, v in o["OR"][2].items() if v}, expect)
        self.assertGreater(len(expect), 1)  # a 3% seasonal bias crosses at least one table step
        for g in sz.RULES:
            self.assertEqual(sum(o[g][2].values()), n)
        self.assertEqual(sum(q[2] for q in track), n)


if __name__ == "__main__":
    unittest.main()
