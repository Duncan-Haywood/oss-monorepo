import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_cant_poshold import aero as A

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



class PositionHoldTests(unittest.TestCase):
    def test_lateral_force_closed_form_matches_four_rotor_allocation(self):
        L, a = 0.22, np.deg2rad(30)
        M = A.rotor_layout(a, L)
        r = L / np.sqrt(2)
        for axis, torque_row, force_row in ((0, 3, 1), (1, 4, 0)):
            # least-norm rotor thrust changes that make a pure torque about this axis and zero yaw and zero net vertical force
            C = np.stack([M[2], M[3], M[4], M[5]])
            rhs = np.zeros(4); rhs[1 + axis] = 1.0
            dT = np.linalg.solve(C, rhs)
            self.assertAlmostEqual(float((M @ dT)[force_row]), float(A.lateral_per_torque(a, L)), places=9)
            self.assertAlmostEqual(float((M @ dT)[torque_row]), 1.0, places=9)
            self.assertAlmostEqual(float((M @ dT)[2]), 0.0, places=9)
        self.assertGreater(r, 0)

    def test_hover_has_no_net_lateral_force_and_yaw_matches_size(self):
        L, a = 0.2, np.deg2rad(25)
        M = A.rotor_layout(a, L)
        Th = np.full(4, 3.0)
        F = M @ Th
        self.assertAlmostEqual(float(F[0]), 0.0, places=12); self.assertAlmostEqual(float(F[1]), 0.0, places=12)
        dT = np.array([1.0, -1.0, 1.0, -1.0])           # yaw pattern: differential thrust of the two spin groups
        self.assertAlmostEqual(float((M @ dT)[5]), 4 * (A.KAPPA * np.cos(a) + L / np.sqrt(2) * np.sin(a)), places=12)

    def test_zero_cant_has_no_lateral_force(self):
        self.assertEqual(float(A.lateral_per_torque(0.0, 0.2)), 0.0)

    def test_coupling_flag_is_identity_at_zero_cant(self):
        x = np.array([[0.5, 0.5, 0.0]]); g = np.full((1, 9), 0.6)
        a = A.score_pos(x, g, 4, 3, couple=True)[0]; b = A.score_pos(x, g, 4, 3, couple=False)[0]
        self.assertEqual(float(a[0]), float(b[0]))

    def test_coupling_flag_matters_with_cant(self):
        x = np.array([[0.5, 0.5, 1.0]]); g = np.full((1, 9), 0.6)
        a = A.score_pos(x, g, 4, 3, couple=True)[0]; b = A.score_pos(x, g, 4, 3, couple=False)[0]
        self.assertNotEqual(float(a[0]), float(b[0]))

    def test_deterministic_and_infeasible(self):
        x = np.array([[0.4, 0.4, 0.3]]); g = np.full((1, 9), 0.55)
        self.assertTrue(np.array_equal(A.score_pos(x, g, 4, 1)[0], A.score_pos(x, g, 4, 1)[0]))
        self.assertEqual(float(A.score_pos(np.array([[0.0, 1.0, 0.0]]), g)[0][0]), -99.0)


if __name__ == "__main__":
    unittest.main()
