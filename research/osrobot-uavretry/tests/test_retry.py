import os, sys, unittest
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavnogo/src", "../../osrobot-uavgust/src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavretry.retry import *
from osrobot_uavnogo.nogo import design_for_limit, outcomes
from osrobot_uavgust.gust import wind_pmf, quantile
from osrobot_uavwind.wind import WindMission

MS = WindMission(3000, 600, 0.5)
PMF = wind_pmf(6, 3)
L = quantile(PMF, 0.6)
D = design_for_limit("fw", MS, L)


class T(unittest.TestCase):
    def test_rows_sum_to_one(self):
        for rho in (0, 0.5, 0.95):
            for row in transition(PMF, rho):
                self.assertAlmostEqual(sum(row), 1.0, places=9)

    def test_outcomes_sum_to_one(self):
        T_ = transition(PMF, 0.8)
        for K in (1, 3, 6):
            self.assertAlmostEqual(sum(day("fw", D, MS, PMF, T_, L, 2, K)[:3]), 1.0, places=9)

    def test_one_slot_matches_single_attempt(self):
        sc, fl, dn = outcomes("fw", D, MS, PMF, L, 1.5)
        d, f, n, u = day("fw", D, MS, PMF, transition(PMF, 0.7), L, 1.5, 1)
        self.assertAlmostEqual(d, dn, places=9)
        self.assertAlmostEqual(f, fl, places=9)
        self.assertAlmostEqual(n, sc, places=9)

    def test_independent_slots_are_geometric(self):
        sc, fl, dn = outcomes("fw", D, MS, PMF, L, 0)
        d, f, n, u = day("fw", D, MS, PMF, transition(PMF, 0.0), L, 0, 4)
        self.assertAlmostEqual(n, sc ** 4, places=6)

    def test_persistence_hurts_retry(self):
        nl = [day("fw", D, MS, PMF, transition(PMF, r), L, 0, 4)[2] for r in (0.0, 0.5, 0.9)]
        self.assertLess(nl[0], nl[1])
        self.assertLess(nl[1], nl[2])

    def test_perfect_forecast_never_fails(self):
        self.assertAlmostEqual(day("fw", D, MS, PMF, transition(PMF, 0.5), L, 0, 5)[1], 0.0, places=9)

    def test_retries_with_forecast_error_add_failures(self):
        T_ = transition(PMF, 0.5)
        f1 = day("fw", D, MS, PMF, T_, L, 2, 1)[1]
        f4 = day("fw", D, MS, PMF, T_, L, 2, 4)[1]
        self.assertGreater(f4, f1)


if __name__ == "__main__":
    unittest.main()
