import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_cant_twrceil import aero as A

PID = np.full((1, 6), 0.55)


class SizingTests(unittest.TestCase):
    def test_zero_cant_matches_uncanted_formulas(self):
        s = A.size(0.2, 0.15, 0.0)
        r = 0.2 / np.sqrt(2)
        Th = s["mass"] * A.G / 4
        self.assertAlmostEqual(float(s["tau_yaw"]), float(2 * (A.TWR * Th - Th) * A.KAPPA), places=12)
        self.assertAlmostEqual(float(s["tau_max"]), float(4 * (A.TWR * Th - Th) * r), places=12)

    def test_cant_raises_yaw_authority_monotonically(self):
        ty = [float(A.size(0.2, 0.15, a)["tau_yaw"]) / float(A.size(0.2, 0.15, a)["mass"]) for a in np.deg2rad([0, 10, 20, 30])]
        self.assertTrue(all(b > a for a, b in zip(ty, ty[1:])))

    def test_cant_costs_mass_and_money(self):
        a, b = A.size(0.2, 0.15, 0.0), A.size(0.2, 0.15, np.deg2rad(30))
        self.assertGreater(float(b["mass"]), float(a["mass"]))
        self.assertGreater(float(b["cost"]), float(a["cost"]))

    def test_hover_vertical_thrust_supports_weight(self):
        a = np.deg2rad(25)
        s = A.size(0.2, 0.15, a)
        self.assertAlmostEqual(float(4 * (s["mass"] * A.G / (4 * np.cos(a))) * np.cos(a)), float(s["mass"] * A.G), places=9)

    def test_yaw_formula_against_hand_value(self):
        a = np.deg2rad(20); L = 0.2
        s = A.size(L, 0.15, a)
        Th = s["mass"] * A.G / (4 * np.cos(a)); dT = A.TWR * Th - Th
        self.assertAlmostEqual(float(s["tau_yaw"]), float(2 * dT * (A.KAPPA * np.cos(a) + L / np.sqrt(2) * np.sin(a))), places=12)


class KappaScalingTests(unittest.TestCase):
    def test_default_is_fixed_kappa(self):
        a, b = A.size(0.2, 0.15, 0.3), A.size(0.2, 0.15, 0.3, 0.0, None)
        self.assertEqual(float(a["tau_yaw"]), float(b["tau_yaw"]))

    def test_kappa_equals_c_times_D(self):
        s = A.size(0.2, 0.15, 0.0, 0.0, 0.126)
        Th = s["mass"] * A.G / 4
        self.assertAlmostEqual(float(s["tau_yaw"]), float(2 * Th * 0.126 * 0.15), places=12)

    def test_c_reproduces_baseline_at_127mm(self):
        s = A.size(0.2, 0.127, 0.0, 0.0, 0.016 / 0.127)
        t = A.size(0.2, 0.127, 0.0)
        self.assertAlmostEqual(float(s["tau_yaw"]), float(t["tau_yaw"]), places=12)

    def test_larger_propeller_more_yaw_with_scaled_kappa(self):
        a, b = A.size(0.3, 0.10, 0.0, 0.0, 0.126), A.size(0.3, 0.20, 0.0, 0.0, 0.126)
        self.assertGreater(float(b["tau_yaw"]) / float(b["mass"]), float(a["tau_yaw"]) / float(a["mass"]))


class TiltLossTests(unittest.TestCase):
    def test_zero_loss_is_default_and_loss_costs_energy(self):
        a, b = A.size(0.2, 0.15, 0.5), A.size(0.2, 0.15, 0.5, 0.0)
        self.assertEqual(float(a["wh"]), float(b["wh"]))
        self.assertGreater(float(A.size(0.2, 0.15, 0.5, 0.2)["wh"]), float(a["wh"]))

    def test_loss_irrelevant_at_zero_cant(self):
        self.assertEqual(float(A.size(0.2, 0.15, 0.0, 0.3)["wh"]), float(A.size(0.2, 0.15, 0.0)["wh"]))

    def test_alpha_max_scales_angle(self):
        x = np.array([[0.4, 0.4, 1.0]])
        J1 = A.score(x, PID, alpha_max=np.deg2rad(20))[1]["alpha"]
        self.assertAlmostEqual(float(J1[0]), np.deg2rad(20), places=12)


class ScoreTests(unittest.TestCase):
    def test_deterministic(self):
        x = np.array([[0.4, 0.4, 0.3]])
        self.assertTrue(np.array_equal(A.score(x, PID, seed=1)[0], A.score(x, PID, seed=1)[0]))

    def test_design_variable_changes_score(self):
        g = np.full((1, 6), 0.6)
        a = A.score(np.array([[0.4, 0.4, 0.0]]), g, 8, 2)[0][0]
        b = A.score(np.array([[0.4, 0.4, 0.6]]), g, 8, 2)[0][0]
        self.assertNotEqual(float(a), float(b))

    def test_infeasible_design_scores_minus_99(self):
        self.assertEqual(float(A.score(np.array([[0.0, 1.0, 0.0]]), PID)[0][0]), -99.0)


if __name__ == "__main__":
    unittest.main()
