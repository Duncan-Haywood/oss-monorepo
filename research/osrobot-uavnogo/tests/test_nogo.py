import os, sys, unittest
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavnogo.nogo import *
from osrobot_uavwind.wind import WindMission

MS = WindMission(3000, 600, 0.5)


class T(unittest.TestCase):
    def test_outcomes_sum_to_one(self):
        pmf = wind_pmf(6, 3)
        d = design_for_limit("fw", MS, 7.0)
        for sf in (0, 1, 3):
            self.assertAlmostEqual(sum(outcomes("fw", d, MS, pmf, 7.0, sf)), 1.0, places=9)

    def test_perfect_forecast_never_fails(self):
        pmf = wind_pmf(6, 3)
        for kind in ("mr", "fw"):
            d = design_for_limit(kind, MS, 8.0)
            self.assertLess(outcomes(kind, d, MS, pmf, 8.0, 0)[1], 0.01)

    def test_forecast_error_creates_failures(self):
        pmf = wind_pmf(6, 3)
        d = design_for_limit("fw", MS, 8.0)
        self.assertGreater(outcomes("fw", d, MS, pmf, 8.0, 3.0)[1], outcomes("fw", d, MS, pmf, 8.0, 0)[1])

    def test_scrub_rate_falls_as_limit_rises(self):
        pmf = wind_pmf(6, 3)
        s = []
        for L in (5.0, 8.0, 11.0):
            d = design_for_limit("fw", MS, L)
            s.append(outcomes("fw", d, MS, pmf, L, 1.0)[0])
        self.assertEqual(s, sorted(s, reverse=True))

    def test_p_launch_limits(self):
        self.assertEqual(p_launch(3, 5, 0), 1.0)
        self.assertEqual(p_launch(6, 5, 0), 0.0)
        self.assertAlmostEqual(p_launch(5, 5, 2), 0.5)


if __name__ == "__main__":
    unittest.main()
