import math, pathlib, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_partpool.model import Params, default_params, effective_doubling, part_hours, simulate


class T(unittest.TestCase):
    def test_parts_from_bom(self):
        hours, v = part_hours()
        self.assertEqual(len(hours), 44)
        self.assertAlmostEqual(sum(hours), 44.0)       # 44 parts x 25 g / 25 g/h
        self.assertGreater(v, 100)

    def test_one_copy_takes_work_time_in_every_policy(self):
        p = default_params(1e9, cv=0)
        for pol in ("whole", "focus", "spread"):
            self.assertAlmostEqual(simulate(p, pol, 1, 2), 50.0, places=6)

    def test_whole_policy_is_generational(self):
        p = default_params(1e9, cv=0)
        self.assertAlmostEqual(simulate(p, "whole", 1, 4), 100.0, places=6)
        self.assertAlmostEqual(simulate(p, "whole", 1, 64), 300.0, places=6)

    def test_focus_beats_whole_when_machine_time_binds(self):
        p = default_params(1e9, cv=0)
        self.assertLess(simulate(p, "focus", 1, 64), simulate(p, "whole", 1, 64))

    def test_focus_two_printers_hand_computed(self):
        # n=2 after 50 h; both print the 44 h of copy 2 (22 h each), one assembles for 6 h: copy 2 at 78 h.
        p = default_params(1e9, cv=0)
        self.assertAlmostEqual(simulate(p, "focus", 1, 3), 78.0, places=6)

    def test_vitamin_stock_limits_growth(self):
        hours, v = part_hours()
        p = Params(tuple(hours), 6.0, v, 1.0, cv=0)    # budget 1/h: n0 -> n0+k needs k*v/1 hours at least
        for pol in ("whole", "focus", "spread"):
            self.assertGreaterEqual(simulate(p, pol, 1, 3), 2 * v - 1e-6)

    def test_zero_budget_never_grows(self):
        hours, v = part_hours()
        p = Params(tuple(hours), 6.0, v, 0.0)
        self.assertEqual(simulate(p, "focus", 1, 2), math.inf)

    def test_bad_policy(self):
        with self.assertRaises(ValueError):
            simulate(default_params(1), "nope")

    def test_seed_reproducible(self):
        p = default_params(1e9)
        self.assertEqual(simulate(p, "focus", 1, 16, seed=3), simulate(p, "focus", 1, 16, seed=3))


if __name__ == "__main__":
    unittest.main()
