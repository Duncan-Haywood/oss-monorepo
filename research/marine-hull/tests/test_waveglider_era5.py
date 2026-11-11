"""Milestone 6w: ERA5 reanalysis waves at the Wave Glider's position."""
import math
import os
import sys
import unittest
from datetime import datetime, timedelta

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
import run_waveglider_era5 as e  # noqa: E402


def synth(a=0.5):
    rows = []
    for m, s in ((6, 1.2), (7, 0.8)):
        for i in range(48):
            hs, tp = 1.0 + 0.03 * i, 6.0 + (i * 5) % 4
            rows.append({"t": datetime(2015, m, 1) + timedelta(hours=i), "hs": hs, "tavg": tp,
                         "hs_e": hs * 0.9, "tm_e": tp * 1.3, "tp_e": tp * 1.5,
                         "u": s * (hs / tp) ** a})
    return rows


class WaveGliderEra5Tests(unittest.TestCase):
    def test_scaled_proxy_is_perfectly_reliable(self):
        rows = synth()
        corr, lam = e.wcorr(rows, e.Q_OB, e.Q_E)
        self.assertAlmostEqual(corr, 1.0, places=12)
        self.assertAlmostEqual(lam, 1.0, places=12)

    def test_constant_calibration_leaves_the_exponent(self):
        rows = synth(0.5)
        self.assertAlmostEqual(e.fit_q(rows, e.Q_OB), 0.5, places=9)
        self.assertAlmostEqual(e.fit_q(rows, e.Q_E), 0.5, places=9)

    def test_plan_reproduces_mean_speed_when_law_is_exact(self):
        rows = synth(0.5)
        p = e.plan(rows, e.Q_E, 0.5)
        for m in (6, 7):
            mm = [r for r in rows if r["t"].month == m]
            self.assertAlmostEqual(p[m], 86.4 * sum(r["u"] for r in mm) / len(mm), places=9)

    def test_committed_data_and_hours(self):
        cwd = os.getcwd()
        os.chdir(os.path.join(HERE, '..'))
        try:
            rows = e.load()
            S = e.hours(rows)
        finally:
            os.chdir(cwd)
        self.assertEqual(len(rows), 3657)
        self.assertEqual(len(S), 3281)
        self.assertTrue(all(r["hs_e"] > 0 and math.isfinite(r["tm_e"]) for r in S))


if __name__ == '__main__':
    unittest.main()
