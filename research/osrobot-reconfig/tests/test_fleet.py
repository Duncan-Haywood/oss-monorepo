import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_reconfig import fleet as F
from osrobot_specialise import model as M


class T(unittest.TestCase):
    def test_single_centred_job_shared_gantry_equals_dedicated_gantry(self):
        j = [dict(L=0.2, tol=0.002, centre=(0.0, 0.0))]
        c = F.compare(j, 0.5, 600)
        self.assertAlmostEqual(c["shared_gantry"], M.gantry_cost(0.2))
        self.assertLessEqual(c["dedicated"], M.gantry_cost(0.2) + 1e-9)

    def test_tray_reach_is_farthest_corner(self):
        self.assertAlmostEqual(F.tray_reach(0.2, (0.3, 0.4)), math.hypot(0.4, 0.5))
        self.assertAlmostEqual(F.tray_reach(0.2, (-0.3, -0.4)), math.hypot(0.4, 0.5))

    def test_arm_unreachable_beyond_r_max(self):
        j = [dict(L=0.2, tol=0.01, centre=(0.95, 0.0))]
        self.assertIsNone(F.shared_arm(j, 0.1, 0))

    def test_arm_rate_none_when_tray_outside_reach(self):
        self.assertIsNone(F.arm_rate(0.3, 0.2, (0.5, 0.0), 0.01))

    def test_precision_rules_out_a_large_arm_on_a_tight_job(self):
        j = [dict(L=0.2, tol=0.001, centre=(0.0, 0.0)), dict(L=0.2, tol=0.005, centre=(0.5, 0.0))]
        self.assertIsNone(F.shared_arm(j, 0.1, 0))      # R ~ 0.64 m gives sigma 0.77 mm, success at 1 mm far below 0.9

    def test_changeover_raises_shared_cost_and_can_make_it_infeasible(self):
        j = [dict(L=0.1, tol=0.005, centre=(0.0, 0.0))] * 3
        self.assertLessEqual(F.shared_gantry(j, 0.3, 0), F.shared_gantry(j, 0.3, 3000))
        self.assertIsNone(F.shared_gantry(j, 0.3, 3 * 3600))

    def test_more_demand_never_lowers_cost(self):
        rng = random.Random(2)
        jobs = F.random_jobs(3, 0.3, rng)
        lo, hi = F.compare(jobs, 0.2, 300), F.compare(jobs, 1.5, 300)
        for k in lo:
            if lo[k] is not None:
                self.assertLessEqual(lo[k], hi[k] + 1e-9)

    def test_survey_is_reproducible_and_wins_sum_to_trials(self):
        a, b = F.survey(3, 0.3, 0.2, 600, 15, 4), F.survey(3, 0.3, 0.2, 600, 15, 4)
        self.assertEqual(a, b)
        self.assertEqual(sum(a["wins"].values()), 15)


if __name__ == "__main__":
    unittest.main()
