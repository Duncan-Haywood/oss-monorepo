import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_wearout.model import Params, fluid_fixed_point, fluid_trajectory, interrupted_fixed_point, simulate, summarise, survives


class Wearout(unittest.TestCase):
    def test_fixed_point_formula(self):
        p = Params(work_h=10, vit_cost=100, budget=2, life_h=1000, fail=0.1, recycle=0.5)
        n = fluid_fixed_point(p)
        make = (1 - p.fail) * (p.budget + p.recycle * p.vit_cost * n / p.life_h) / p.vit_cost
        self.assertAlmostEqual(make, n / p.life_h)

    def test_fluid_reaches_fixed_point(self):
        p = Params(work_h=10, vit_cost=100, budget=2, life_h=1000)
        self.assertAlmostEqual(fluid_trajectory(p, 1, 40000), fluid_fixed_point(p), delta=0.5)

    def test_interrupted_fixed_point_reduces_to_fluid_for_long_life(self):
        p = Params(work_h=1, vit_cost=100, budget=2, life_h=1e7, fail=0.1, recycle=0.5)
        self.assertAlmostEqual(interrupted_fixed_point(p) / fluid_fixed_point(p), 1.0, places=4)
        self.assertLess(interrupted_fixed_point(Params(50, 170, 4, 500)), fluid_fixed_point(Params(50, 170, 4, 500)))

    def test_short_life_dies_out(self):
        p = Params(work_h=50, vit_cost=10, budget=1e6, life_h=30)
        self.assertFalse(survives(p))
        self.assertLess(fluid_trajectory(p, 5, 2000), 1e-3)
        self.assertEqual(simulate(p, 1, 2000, seed=1)[-1], 0)

    def test_recycling_never_hurts_fixed_point(self):
        a = fluid_fixed_point(Params(50, 170, 4, 2000, recycle=0.0))
        b = fluid_fixed_point(Params(50, 170, 4, 2000, recycle=0.5))
        self.assertGreater(b, a)

    def test_sim_close_to_fixed_point_when_import_limited(self):
        p = Params(work_h=10, vit_cost=100, budget=2, life_h=1000)
        lo, med, hi, dead = summarise(p, 1, 20000, reps=20)
        self.assertAlmostEqual(med, fluid_fixed_point(p), delta=0.15 * fluid_fixed_point(p))
        self.assertEqual(dead, 0)

    def test_more_budget_larger_fleet(self):
        m = [summarise(Params(50, 170, b, 2000), 1, 12000, reps=10)[1] for b in (1, 4, 16)]
        self.assertEqual(m, sorted(m))

    def test_recycling_credit_funds_a_build(self):
        # no import at all: a copy can only appear if a retired machine's recovered vitamins pay for it
        def rises(recycle):
            p = Params(work_h=1, vit_cost=10, budget=0, life_h=100, recycle=recycle, cv=0)
            for seed in range(20):
                s = simulate(p, 2, 400, seed, grid=1.0)
                if any(b > a for a, b in zip(s, s[1:])):
                    return True
            return False
        self.assertFalse(rises(0.0))
        self.assertTrue(rises(1.0))


if __name__ == "__main__":
    unittest.main()
