import os, sys, unittest
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavnogo/src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavvalue.value import net_value, best_rule
from osrobot_uavgust.gust import wind_pmf
from osrobot_uavwind.wind import WindMission

MS = WindMission(3000, 600, 0.5)
PMF = wind_pmf(6, 3)
GRID = [4.0, 6.0, 8.0, 10.0, 12.0]


class T(unittest.TestCase):
    def test_parts_sum_to_one(self):
        _, (sc, fl, dn, m) = net_value("fw", MS, PMF, 8.0, 8.0, 1.0, 200, 1500, 10, 100)
        self.assertAlmostEqual(sc + fl + dn, 1.0, places=9)

    def test_zero_value_never_beats_positive_value(self):
        a = best_rule("fw", MS, PMF, GRID, 1.0, 0, 1500, 10, 100)[0]
        b = best_rule("fw", MS, PMF, GRID, 1.0, 500, 1500, 10, 100)[0]
        self.assertGreater(b, a)

    def test_free_threshold_never_worse_than_tied(self):
        for sf in (0, 2):
            free = best_rule("fw", MS, PMF, GRID, sf, 200, 1500, 10, 100)[0]
            tied = best_rule("fw", MS, PMF, GRID, sf, 200, 1500, 10, 100, tied=True)[0]
            self.assertGreaterEqual(free, tied - 1e-12)

    def test_perfect_forecast_threshold_not_above_limit(self):
        _, L, T, _ = best_rule("fw", MS, PMF, GRID, 0, 200, 1500, 10, 100)
        self.assertLessEqual(T, L + 1e-9)


if __name__ == "__main__":
    unittest.main()
