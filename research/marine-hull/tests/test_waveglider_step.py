"""Milestone 6t: step against ramp in the Wave Glider's daily speed state."""
import math
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
import run_waveglider_step as r  # noqa: E402


class WaveGliderStepTests(unittest.TestCase):
    def test_step_found_and_preferred_on_planted_step(self):
        series = [(t, -0.5 + (math.log(0.7) if t >= 30 else 0.0) + 0.01 * ((t * 7) % 5 - 2)) for t in range(60)]
        bic_s, beta, _, tau = r.fit("S", series)
        self.assertEqual(tau, 30)
        self.assertAlmostEqual(math.exp(beta[1]), 0.7, places=2)
        self.assertLess(bic_s, r.fit("R", series)[0] - 6)

    def test_ramp_preferred_on_planted_ramp(self):
        series = [(t, -0.5 - 0.005 * t + 0.01 * ((t * 7) % 5 - 2)) for t in range(60)]
        self.assertLess(r.fit("R", series)[0], r.fit("S", series)[0])
        self.assertAlmostEqual(r.slope(series), -0.005, places=3)

    def test_daily_residual_and_breakpoint_bounds(self):
        rows = [{"t": datetime(2015, 6, 1 + d, h), "u": 0.5, "hs": 2.0, "km": 100.0, "n": 12, "lat": 20.0, "lon": -150.0}
                for d in range(3) for h in range(8)]
        s = r.daily(rows)
        self.assertEqual([t for t, _ in s], [0, 1, 2])
        self.assertAlmostEqual(s[0][1], math.log(0.5) - r.B * math.log(2.0), places=12)
        ts = r.taus([(t, 0.0) for t in range(20)])
        self.assertEqual((ts[0], ts[-1]), (7, 13))

    def test_real_series_has_the_july_gap(self):
        s = r.daily(r.load_all())
        gap = max(b[0] - a[0] for a, b in zip(s, s[1:]))
        self.assertGreaterEqual(gap, 60)


if __name__ == "__main__":
    unittest.main()
