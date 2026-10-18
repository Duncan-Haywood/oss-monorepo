import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_uptime import uptime as U
from osrobot_reconfig import fleet as F


class T(unittest.TestCase):
    def test_p_up_matches_hand_values(self):
        self.assertAlmostEqual(U.p_up(1, 1, 0.9), 0.9)
        self.assertAlmostEqual(U.p_up(2, 1, 0.9), 0.99)
        self.assertAlmostEqual(U.p_up(2, 2, 0.9), 0.81)
        self.assertAlmostEqual(U.p_up(3, 2, 0.9), 3 * 0.81 * 0.1 + 0.729)

    def test_units_for_adds_spares_only_when_needed(self):
        self.assertEqual(U.units_for(1, 0.99, 0.98), 1)
        self.assertEqual(U.units_for(1, 0.99, 0.999), 2)
        self.assertEqual(U.units_for(3, 1.0, 0.999999), 3)
        self.assertIsNone(U.units_for(1, 0.0, 0.5))

    def test_availability(self):
        self.assertAlmostEqual(U.availability(990, 10), 0.99)

    def test_bare_costs_reproduce_osrobot_reconfig(self):
        rng = random.Random(3)
        for _ in range(4):
            jobs = F.random_jobs(3, 0.3, rng)
            t, c = U.priced(jobs, 0.2, 600, 0.99, 0.99), F.compare(jobs, 0.2, 600)
            for k in c:
                if c[k] is None:
                    self.assertNotIn(k, t)
                else:
                    self.assertAlmostEqual(t[k]["bare"], c[k], places=6)

    def test_spares_never_lower_cost_and_all_jobs_costs_at_least_per_job(self):
        jobs = F.random_jobs(4, 0.3, random.Random(5))
        for v in U.priced(jobs, 0.2, 600, 0.97, 0.995).values():
            self.assertGreaterEqual(v["per_job"], v["bare"] - 1e-9)
            self.assertGreaterEqual(v["all_jobs"], v["per_job"] - 1e-9)

    def test_shared_all_jobs_equals_per_job(self):
        jobs = F.random_jobs(4, 0.2, random.Random(1), tols=(0.005, 0.01))
        for k, v in U.priced(jobs, 0.2, 600, 0.97, 0.995).items():
            if k != "dedicated":
                self.assertEqual(v["per_job"], v["all_jobs"])

    def test_perfect_availability_adds_nothing(self):
        jobs = F.random_jobs(3, 0.3, random.Random(2))
        for v in U.priced(jobs, 0.2, 600, 1.0, 0.9999).values():
            self.assertAlmostEqual(v["per_job"], v["bare"])

    def test_survey_reproducible(self):
        a, b = U.survey(3, 0.3, 0.2, 600, 0.98, 0.99, 12, 4), U.survey(3, 0.3, 0.2, 600, 0.98, 0.99, 12, 4)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
