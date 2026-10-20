import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from society_plaza import (LEFT, LEN, RIGHT, WID, Agent, make_crowd, prefers, run, step,  # noqa: E402
                           wrap)


class Geometry(unittest.TestCase):
    def test_wrap_is_shortest_signed_difference(self):
        self.assertAlmostEqual(wrap(1.0), 1.0)
        self.assertAlmostEqual(wrap(LEN - 1.0), -1.0)
        self.assertAlmostEqual(wrap(-LEN + 2.0), 2.0)

    def test_crowd_composition(self):
        a = make_crowd(60, 0.2, "left", random.Random(0))
        self.assertEqual(len(a), 60)
        self.assertEqual(sum(x.robot for x in a), 12)
        self.assertEqual(sum(x.dir == 1 for x in a), 30)
        self.assertEqual(sum(x.robot and x.dir == 1 for x in a), 6)
        self.assertTrue(all(x.side == LEFT for x in a if x.robot))
        self.assertTrue(all(0 < x.y < WID for x in a))

    def test_robots_with_policy_none_have_no_side(self):
        a = make_crowd(10, 0.4, "none", random.Random(0))
        self.assertTrue(all(prefers(x, 9) == 0 for x in a if x.robot))


class Dynamics(unittest.TestCase):
    def test_lone_walker_reaches_desired_speed_and_stays_in_corridor(self):
        a = Agent(5.0, 3.0, 1, False, "human", 1.3, 0.6)
        for _ in range(400):
            step([a], 9, 0.0, random.Random(0))
        self.assertAlmostEqual(a.vx, 1.3, places=2)
        self.assertAlmostEqual(a.y, 3.0, places=2)

    def test_walls_keep_agents_inside(self):
        rng = random.Random(1)
        a = make_crowd(60, 0.0, "left", rng)
        for _ in range(600):
            step(a, 9, 0.15, rng)
        self.assertTrue(all(0 < x.y < WID for x in a))
        self.assertTrue(all(0 <= x.x < LEN for x in a))

    def test_head_on_pair_is_pushed_to_each_ones_own_right(self):
        east = Agent(10.0, 3.0, 1, False, "human", 1.3, 0.6)
        west = Agent(11.5, 3.0, -1, False, "human", 1.3, 0.6)
        east.mem = west.mem = [RIGHT] * 9
        step([east, west], 9, 0.0, random.Random(0))
        self.assertLess(east.vy, 0)       # right of an eastbound walker is lower y
        self.assertGreater(west.vy, 0)

    def test_same_direction_pair_gets_no_sideways_push(self):
        a = Agent(10.0, 3.0, 1, False, "human", 1.3, 0.6)
        b = Agent(11.5, 3.0, 1, False, "human", 1.3, 0.6)
        step([a, b], 9, 0.0, random.Random(0))
        self.assertAlmostEqual(a.vy, 0.0)
        self.assertAlmostEqual(b.vy, 0.0)

    def test_committed_left_pair_sidesteps_left(self):
        east = Agent(10.0, 3.0, 1, True, "left", 1.3, 0.6)
        east.side = LEFT
        west = Agent(12.0, 3.0, -1, True, "left", 1.3, 0.6)
        west.side = LEFT
        step([east, west], 9, 0.0, random.Random(0))
        self.assertGreater(east.vy, 0)
        self.assertLess(west.vy, 0)

    def test_memory_majority_sets_preference(self):
        a = Agent(0, 3, 1, False, "human", 1.3, 0.6)
        a.mem = [RIGHT] * 4 + [LEFT] * 5
        self.assertEqual(prefers(a, 9), LEFT)
        a.mem = [LEFT] * 4 + [RIGHT] * 5
        self.assertEqual(prefers(a, 9), RIGHT)


class Runs(unittest.TestCase):
    def test_runs_are_seeded(self):
        a = run(n=20, rho=0.2, seconds=20, seed=3)
        b = run(n=20, rho=0.2, seconds=20, seed=3)
        c = run(n=20, rho=0.2, seconds=20, seed=4)
        for k in ("tipped", "lane", "detour", "passes"):
            self.assertEqual(a[k], b[k])
        self.assertNotEqual(a["lane"], c["lane"])

    def test_people_form_lanes_on_their_convention(self):
        r = run(n=40, rho=0.0, seconds=60, seed=0)
        self.assertGreater(r["lane"], 1.0)       # westbound walk higher y than eastbound: keep right
        self.assertGreaterEqual(r["detour"], 1.0)
        self.assertGreater(r["passes"], 100)

    def test_committed_left_robots_cost_people_space_and_speed(self):
        base = run(n=40, rho=0.0, seconds=60, seed=0)
        mixed = run(n=40, rho=0.3, policy="left", seconds=60, seed=0)
        self.assertGreater(mixed["intrude"], base["intrude"])
        self.assertLess(mixed["speed"], base["speed"])

    def test_adaptive_robots_leave_the_crowd_as_it_was(self):
        base = run(n=40, rho=0.0, seconds=60, seed=0)
        ad = run(n=40, rho=0.3, policy="adaptive", seconds=60, seed=0)
        self.assertLess(abs(ad["lane"] - base["lane"]), 0.8)
        self.assertLess(ad["intrude"], 0.01)


if __name__ == "__main__":
    unittest.main()
