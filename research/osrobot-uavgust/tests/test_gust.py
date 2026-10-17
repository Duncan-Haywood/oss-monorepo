import os, sys, unittest
here = os.path.dirname(__file__)
for p in ("../src", "../../osrobot-uavwind/src", "../../osrobot-uav/src"):
    sys.path.insert(0, os.path.join(here, p))
from osrobot_uavgust.gust import *
from osrobot_uavwind.wind import WindMission, size_fixedwing, size_multirotor


class T(unittest.TestCase):
    def test_pmf_sums_to_one(self):
        for mu, s in ((0, 3), (5, 2), (8, 3), (12, 1)):
            self.assertAlmostEqual(sum(p for _, p in wind_pmf(mu, s)), 1.0, places=9)

    def test_pmf_mean_of_folded_normal(self):
        pmf = wind_pmf(8, 1)  # far from zero, so |w| is about w
        self.assertAlmostEqual(sum(w * p for w, p in pmf), 8.0, delta=0.05)

    def test_quantile_is_monotone_and_bounded(self):
        pmf = wind_pmf(5, 3)
        qs = [quantile(pmf, q) for q in (0.1, 0.5, 0.9, 0.99)]
        self.assertEqual(qs, sorted(qs))
        self.assertLessEqual(qs[-1], WMAX)

    def test_design_for_higher_quantile_is_heavier(self):
        ms = WindMission(3000, 600, 0.5)
        pmf = wind_pmf(6, 3)
        m50 = size_for("fw", ms, quantile(pmf, 0.5))["mass"]
        m99 = size_for("fw", ms, quantile(pmf, 0.99))["mass"]
        self.assertGreater(m99, m50)

    def test_success_prob_meets_design_quantile(self):
        # a design closed for wind wd keeps its full stay at every wind <= wd, so P(success) >= P(|w| <= wd)
        ms = WindMission(3000, 600, 0.5)
        pmf = wind_pmf(6, 3)
        wd = quantile(pmf, 0.9)
        d = size_for("fw", ms, wd)
        p_cover = sum(p for w, p in pmf if w <= wd)
        self.assertGreaterEqual(success_prob("fw", d, ms, pmf) + 1e-9, p_cover - 0.01)

    def test_spending_the_reserve_only_helps(self):
        ms = WindMission(3000, 600, 0.5)
        pmf = wind_pmf(8, 3)
        d = size_for("mr", ms, 8.0)
        self.assertGreaterEqual(success_prob("mr", d, ms, pmf, True), success_prob("mr", d, ms, pmf, False))

    def test_zero_sigma_limit_is_the_steady_wind(self):
        ms = WindMission(3000, 600, 0.5)
        d = size_for("fw", ms, 6.0)
        s = stay("fw", d, ms, 6.0)
        self.assertAlmostEqual(s, ms.loiter, delta=2.0)

    def test_overwhelming_wind_fails(self):
        ms = WindMission(3000, 600, 0.5)
        d = size_for("mr", ms, 5.0)
        self.assertIsNone(stay("mr", d, ms, 25.0))


if __name__ == "__main__":
    unittest.main()
