import math
import unittest

from slip_twin.model import (Car, steady_radius_ratio, steady_radius_sim, charpoly, is_hurwitz, closed_loop_poly, twin_poly,
                             real_stable, max_stable_speed, simulate)


class T(unittest.TestCase):
    def test_charpoly_known(self):
        self.assertEqual(charpoly([[0, 1], [-2, -3]]), [1.0, 3.0, 2.0])
        p = charpoly([[1, 2, 0], [0, 3, 1], [0, 0, 4]])      # upper triangular: roots 1, 3, 4
        self.assertAlmostEqual(p[1], -8.0)
        self.assertAlmostEqual(p[2], 19.0)
        self.assertAlmostEqual(p[3], -12.0)

    def test_routh(self):
        self.assertTrue(is_hurwitz([1, 6, 11, 6]))           # roots -1 -2 -3
        self.assertFalse(is_hurwitz([1, 1, 1, 6]))           # c1 c2 < c3
        self.assertFalse(is_hurwitz([1, -1, 2]))

    def test_understeer_gradient_sign(self):
        self.assertGreater(Car().K, 0)
        self.assertLess(Car(cf=80000, cr=50000).K, 0)
        self.assertAlmostEqual(Car(cf=70000, cr=70000, a=1.3, b=1.3).K, 0.0, places=12)

    def test_steady_radius_law(self):
        for car, v in ((Car(), 10.0), (Car(), 25.0), (Car(cf=80000, cr=50000), 15.0)):
            rs = steady_radius_sim(car, v, 100.0, T=30.0)
            self.assertAlmostEqual(rs, 100.0 * steady_radius_ratio(car.K, car.L, v), places=4)

    def test_radius_doubles_at_characteristic_speed(self):
        car = Car()
        self.assertAlmostEqual(steady_radius_ratio(car.K, car.L, car.v_char()), 2.0, places=12)

    def test_oversteer_open_loop_unstable_above_critical(self):
        car = Car(cf=80000, cr=50000)
        vc = car.v_crit()
        for v, ok in ((vc - 2, True), (vc + 2, False)):
            A, _ = car.matrices(v)
            blk = [[A[2][2], A[2][3]], [A[3][2], A[3][3]]]
            self.assertEqual(is_hurwitz(charpoly(blk)), ok)

    def test_twin_poly_hurwitz_everywhere(self):
        for v in (0.5, 5.0, 50.0, 500.0):
            for kp, kd in ((0.01, 0.1), (1.0, 0.1), (5.0, 5.0)):
                self.assertTrue(is_hurwitz(twin_poly(2.6, v, kp, kd)))
                self.assertTrue(is_hurwitz(twin_poly(2.6, v, kp, kd, Car().K)))

    def test_low_speed_real_loop_matches_twin_sign(self):
        self.assertTrue(real_stable(Car(), 2.0, 0.4, 0.5))

    def test_routh_agrees_with_simulation(self):
        car = Car()
        for v, stable in ((8.0, True), (20.0, False)):
            self.assertEqual(real_stable(car, v, 0.4, 0.5), stable)
            tr = simulate(car, v, lambda t, x: -0.4 * x[0] - 0.5 * x[1], 30.0, 2e-3, x0=(1.0, 0, 0, 0))
            late = max(abs(x[0]) for t, x in tr if t > 25)
            self.assertEqual(late < 1e-3, stable)

    def test_max_stable_speed_bracket(self):
        car = Car()
        vm = max_stable_speed(car, 0.4, 0.5)
        self.assertTrue(real_stable(car, vm - 0.01, 0.4, 0.5))
        self.assertFalse(real_stable(car, vm + 0.01, 0.4, 0.5))


if __name__ == "__main__":
    unittest.main()
