import unittest
from invthrust_twin.model import accel, gains, step, overshoot, twin_overshoot, G


class T(unittest.TestCase):
    def test_exact_inverse_is_identity_inside_limits(self):
        for r in (-1, -0.5, 0, 1, 2, 3):
            self.assertAlmostEqual(accel(r * G, 2, "exact"), r * G, places=9)

    def test_exact_limits(self):
        self.assertAlmostEqual(accel(-5 * G, 2, "exact"), -G)
        self.assertAlmostEqual(accel(9 * G, 2, "exact"), 3 * G)

    def test_linear_matches_thrust_twin_closed_form(self):
        for a in (-G, -1.0, 1.0, G):
            self.assertAlmostEqual(accel(a, 2, "linear"), a + a * a / (4 * G), places=9)

    def test_hover_trim_exact_for_any_exponent(self):
        for n in (1.5, 2, 3):
            for m in ("linear", "exact"):
                self.assertAlmostEqual(accel(0.0, n, m), 0.0)

    def test_exact_with_right_model_reproduces_twin_overshoot(self):
        kp, kd = gains(1.0, 0.5)
        for s in (1, -1):
            x0 = s * 0.3 * G
            self.assertAlmostEqual(overshoot(step(kp, kd, x0, 20, 2, "exact"), x0), twin_overshoot(0.5), places=4)

    def test_wrong_exponent_breaks_exact_inverse(self):
        self.assertNotAlmostEqual(accel(G, 2.5, "exact"), G, places=2)

    def test_unknown_mode_raises(self):
        with self.assertRaises(ValueError):
            accel(1.0, 2, "cubic")


if __name__ == "__main__":
    unittest.main()
