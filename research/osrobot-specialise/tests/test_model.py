import math, unittest
from osrobot_specialise.model import *


class T(unittest.TestCase):
    def test_trap_triangle_and_trapezoid(self):
        self.assertAlmostEqual(trap_time(0.0, 1, 1), 0.0)
        self.assertAlmostEqual(trap_time(0.5, 1, 1), 2 * math.sqrt(0.5))       # never reaches vmax
        self.assertAlmostEqual(trap_time(3.0, 1, 1), 3.0 + 1.0)                # d/v + v/a
        self.assertEqual(trap_time(-3.0, 1, 1), trap_time(3.0, 1, 1))

    def test_ik_reach_boundary(self):
        self.assertIsNotNone(ik(0.4, 0.4, 0.0))
        self.assertIsNone(ik(0.4, 0.401, 0.0))
        q1, q2 = ik(0.4, 0.2, 0.1)
        l = 0.2
        x = l * math.cos(q1) + l * math.cos(q1 + q2)
        y = l * math.sin(q1) + l * math.sin(q1 + q2)
        self.assertAlmostEqual(x, 0.2); self.assertAlmostEqual(y, 0.1)

    def test_success_monotone(self):
        self.assertGreater(p_inside(0.002, 0.0005), p_inside(0.001, 0.0005))
        self.assertAlmostEqual(p_inside(1.0, 0.001), 1.0)

    def test_arm_unbuildable_when_area_too_big(self):
        self.assertIsNone(evaluate("arm", 1.6, 0.002))
        self.assertIsNotNone(evaluate("gantry", 1.6, 0.002))

    def test_reproducible(self):
        a = evaluate("gantry", 0.3, 0.001, n=200, seed=3)
        b = evaluate("gantry", 0.3, 0.001, n=200, seed=3)
        self.assertEqual(a, b)

    def test_cycle_grows_with_area(self):
        small, big = evaluate("gantry", 0.2, 0.002, n=300), evaluate("gantry", 0.8, 0.002, n=300)
        self.assertGreater(big["cycle_s"], small["cycle_s"])
        small, big = evaluate("arm", 0.2, 0.002, n=300), evaluate("arm", 0.8, 0.002, n=300)
        self.assertGreater(big["cost"], small["cost"])

    def test_tight_tolerance_favours_gantry_on_success(self):
        g, a = evaluate("gantry", 0.4, 0.0005, n=200), evaluate("arm", 0.4, 0.0005, n=200)
        self.assertGreater(g["success"], a["success"])

    def test_arm_wins_in_a_middle_band_and_shrinks_with_tight_tolerance(self):
        Ls = [0.05 + 0.01 * i for i in range(160)]
        loose, tight = arm_wins(0.01, Ls), arm_wins(0.0005, Ls)
        self.assertTrue(loose)
        self.assertTrue(len(tight) <= len(loose))
        self.assertTrue(all(L <= A["r_max"] * math.sqrt(2) + 1e-9 for L in loose))

    def test_torque_limit_slows_big_arm(self):
        small, big = evaluate("arm", 0.2, 0.01, n=300), evaluate("arm", 1.0, 0.01, n=300)
        self.assertGreater(big["cycle_s"], small["cycle_s"])

    def test_energy_includes_holding(self):
        g = evaluate("gantry", 0.3, 0.002, n=100)
        self.assertGreater(g["energy_j"], G["hold_w"] * 3 * g["cycle_s"] - 1e-9)


if __name__ == "__main__":
    unittest.main()
