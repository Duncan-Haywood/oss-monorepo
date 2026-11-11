"""Milestone 6u: on-board waves, wind and power for the Wave Glider."""
import math
import os
import sys
import unittest
from datetime import datetime, timedelta

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, '..', 'experiments'))
import run_waveglider_onboard as o  # noqa: E402
import run_waveglider_onboard_posthoc as ph  # noqa: E402


def synth(b=0.4, c=-0.7, d=-0.02):
    rows = []
    for m, s in ((6, 0.5), (7, 0.7)):
        for i in range(60):
            hs, tp, hw = 0.8 + 0.04 * i, 5.0 + (i * 7) % 6, (i * 3) % 11 - 5.0
            rows.append({"t": datetime(2015, m, 1) + timedelta(hours=i), "hs": hs, "tavg": tp, "head": hw,
                         "cross": float(i % 4), "u": s * hs ** b * tp ** c * math.exp(d * hw)})
    return rows


class WaveGliderOnboardTests(unittest.TestCase):
    def test_fit_recovers_planted_exponents(self):
        rows = synth()
        b, c = o.fit(rows, [o.LOG_OB, lambda r: math.log(r["tavg"])])[:2]
        b4, d, e = o.fit(rows, [o.LOG_OB, lambda r: math.log(r["tavg"]), lambda r: r["head"],
                                lambda r: r["cross"]])[1:]
        self.assertAlmostEqual(b, 0.4, delta=0.05)  # head term omitted, small bias allowed
        self.assertAlmostEqual(d, -0.02, places=9)
        self.assertAlmostEqual(e, 0.0, places=9)

    def test_reliability_of_identical_proxy_is_one(self):
        rows = [dict(r, hs_b=r["hs"]) for r in synth()]
        corr, lam = o.reliability(rows)
        self.assertAlmostEqual(corr, 1.0, places=12)
        self.assertAlmostEqual(lam, 1.0, places=12)

    def test_angdiff_wraps(self):
        self.assertEqual(o.angdiff(350, 10), 20)
        self.assertEqual(o.angdiff(10, 350), 20)
        self.assertEqual(o.angdiff(180, 0), 180)

    def test_explained_ratio(self):
        bef, aft = {"hs": 2.0, "head": 0.0}, {"hs": 1.0, "head": 0.0}
        self.assertAlmostEqual(o.explained(bef, aft, 0.5, -0.01), 2 ** -0.5)

    def test_night_drain_reads_local_19_to_05(self):
        t0 = datetime(2015, 8, 1)
        rows = [{"t": t0 + timedelta(hours=h), "power": 600000.0 - 5000 * h} for h in range(72)]
        dr = ph.night_drain(rows, t0, t0 + timedelta(days=3))
        self.assertTrue(dr)
        self.assertTrue(all(abs(x - 5000) < 1e-9 for x in dr))

    def test_committed_data_loads(self):
        cwd = os.getcwd()
        os.chdir(os.path.join(HERE, '..'))
        try:
            rows = o.load()
        finally:
            os.chdir(cwd)
        self.assertEqual(len(rows), 3657)
        self.assertEqual(len(o.usable(rows)), 3281)


if __name__ == "__main__":
    unittest.main()
