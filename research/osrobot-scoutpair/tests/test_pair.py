import random, unittest
from osrobot_scoutpair import model as M


class T(unittest.TestCase):
    def test_flight_time_scales_inversely_with_speed(self):
        F = M.Field(1)
        _, t1, _ = M.scout_flight(F, random.Random(0), 2.0)
        _, t2, _ = M.scout_flight(F, random.Random(0), 4.0)
        self.assertLess(t2, t1)

    def test_leg_seconds_dry_and_mud(self):
        F = M.Field(0, mud=0.0)
        self.assertAlmostEqual(M.leg_seconds(F, (0, 0), (10, 0), 2.0), 5.0)
        F2 = M.Field(0, mud=1.0)
        self.assertAlmostEqual(M.leg_seconds(F2, (0, 0), (10, 0), 2.0), 10.0)

    def test_mud_plan_not_slower_to_drive_on_planning_cost(self):
        F = M.Field(3)
        r = random.Random(5)
        t, _, _ = M.scout_flight(F, r, 5.0)
        st = (F.X, 0.0)
        eu = M.two_opt(M.nearest_neighbour(t, st), st)
        cost = lambda a, b: M.leg_seconds(F, a, b, 1.5)
        mu = M.two_opt_matrix(M.nearest_neighbour(t, st), st, cost)
        self.assertEqual(sorted(eu), sorted(mu))

    def test_pair_makespan_adds_stages(self):
        F = M.Field(2)
        r = M.run_pair(F, random.Random(1))
        self.assertAlmostEqual(r["makespan_min"], r["ground_min"] + r["fly_min"])
        self.assertGreater(r["targets"], 0)

    def test_perfect_scout_no_fp_kills_most(self):
        F = M.Field(4)
        r = M.run_pair(F, random.Random(1), v_scout=0.01, p_max=1.0)
        self.assertGreater(r["kill"], 0.9)

    def test_bad_plan_raises(self):
        with self.assertRaises(ValueError):
            M.run_pair(M.Field(0), random.Random(0), plan="x")
