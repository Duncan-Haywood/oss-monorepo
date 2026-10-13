import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_repair.model import Params, break_even_cost, fixed_point, repairs, simulate, summarise


class Repair(unittest.TestCase):
    def test_replace_only_matches_c0_s0_formula(self):
        a = Params(50, 170, 4, 500)
        b = Params(50, 170, 4, 500, repair_cost=0.0, repair_ok=0.0)
        self.assertAlmostEqual(fixed_point(a), fixed_point(b))
        self.assertFalse(repairs(a))

    def test_break_even_is_where_fixed_points_cross(self):
        s = 0.7
        p = Params(50, 170, 4, 500, repair_cost=s, repair_ok=s)
        self.assertAlmostEqual(fixed_point(p), fixed_point(Params(50, 170, 4, 500)))
        self.assertAlmostEqual(break_even_cost(p), s)

    def test_perfect_cheap_repair_gives_larger_fleet_formula(self):
        self.assertGreater(fixed_point(Params(50, 170, 4, 500, repair_cost=0.1, repair_ok=0.9)),
                           fixed_point(Params(50, 170, 4, 500)))

    def test_deterministic_given_seed(self):
        p = Params(50, 170, 4, 500, repair_cost=0.3, repair_h=10, repair_ok=0.8)
        self.assertEqual(simulate(p, 1, 5000, 3), simulate(p, 1, 5000, 3))

    def test_free_perfect_repair_never_dies(self):
        p = Params(50, 170, 4, 200, repair_cost=0.0, repair_h=0.0, repair_ok=1.0)
        self.assertEqual(summarise(p, 1, 5000, 10)[3], 0.0)

    def test_no_budget_no_repair_dies(self):
        s = simulate(Params(50, 170, 0, 100), 1, 5000, 0)
        self.assertEqual(s[-1], 0)

    def test_repair_helps_survival_at_short_life(self):
        a = summarise(Params(50, 170, 4, 100), 1, 10000, 30)[3]
        b = summarise(Params(50, 170, 4, 100, repair_cost=0.2, repair_h=5, repair_ok=0.9, reserve=0.4), 1, 10000, 30)[3]
        self.assertLess(b, a)

    def test_reserve_raises_fleet(self):
        kw = dict(repair_cost=0.2, repair_h=5, repair_ok=0.9)
        lo = summarise(Params(50, 170, 4, 2000, **kw), 1, 8000, 20)[1]
        hi = summarise(Params(50, 170, 4, 2000, reserve=0.4, **kw), 1, 8000, 20)[1]
        self.assertGreater(hi, lo)


if __name__ == "__main__":
    unittest.main()
