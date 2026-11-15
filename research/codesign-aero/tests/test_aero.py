import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero import aero as A


class SizingTests(unittest.TestCase):
    def test_mass_closure_is_consistent(self):
        s = A.size(0.15, 0.127)
        parts = A.PAYLOAD + A.ELEC + s["wh"] / A.WH_KG + (0.05 + 0.8 * 0.15) + 4 * 0.045 * (A.TWR * s["mass"] * A.G / 4 / 9.0) ** 1.2
        self.assertAlmostEqual(float(s["mass"]), float(parts), places=3)

    def test_bigger_props_need_less_battery(self):
        self.assertLess(float(A.size(0.3, 0.25)["wh"]), float(A.size(0.3, 0.1)["wh"]))

    def test_props_must_not_overlap(self):
        self.assertFalse(bool(A.size(0.08, 0.25)["feasible"]))
        self.assertTrue(bool(A.size(0.2, 0.127)["feasible"]))

    def test_diverging_design_stays_finite(self):
        s = A.size(0.3, 0.001)
        self.assertTrue(np.isfinite(s["mass"]) and not bool(s["feasible"]))


    def test_closure_not_cost_cap_screens_small_props(self):
        # README: the closure check removes the diverging small-prop designs; no closed design reaches the cost cap.
        L, D = np.meshgrid(np.linspace(*A.L_RANGE, 40), np.linspace(*A.D_RANGE, 40))
        s = A.size(L, D)
        overlap_ok = np.sqrt(2) * L >= 1.05 * D
        self.assertGreater(int((overlap_ok & ~s["closed"]).sum()), 0)
        self.assertEqual(int((s["closed"] & (s["cost"] > A.COST_CAP)).sum()), 0)

    def test_unclosed_mass_is_infeasible(self):
        # Quality census 2026-11-15: no mass closes at L 0.146, D 0.097 (m_new > m from 0.5 to 20 kg), so it is not a design.
        for m in (0.5, 1.0, 2.0, 5.0, 10.0):
            self.assertGreater(float(A._mass_update(m, 0.146, 0.097)), m)
        s = A.size(0.146, 0.097)
        self.assertFalse(bool(s["closed"]))
        self.assertFalse(bool(s["feasible"]))

    def test_slow_near_fold_design_still_closes(self):
        # Converges slowly near the fold (still moving at 200 iterations); it has a fixed point, so it is a design.
        s = A.size(0.17026, 0.10179)
        self.assertTrue(bool(s["closed"]))
        self.assertAlmostEqual(float(s["mass"]), float(A._mass_update(s["mass"], 0.17026, 0.10179)), places=3)

    def test_every_feasible_design_is_a_fixed_point(self):
        L, D = np.meshgrid(np.linspace(*A.L_RANGE, 40), np.linspace(*A.D_RANGE, 40))
        s = A.size(L, D)
        f = s["feasible"]
        self.assertGreater(int(f.sum()), 0)
        res = np.abs(A._mass_update(s["mass"], L, D) - s["mass"])[f]
        self.assertLess(float((res / s["mass"][f]).max()), 1e-4)

    def test_hover_endurance_matches_requirement(self):
        # Independent of the closure loop: battery energy at the closed mass gives 15 min of actuator-disc hover.
        L, D = 0.2, 0.15
        s = A.size(L, D)
        m = float(s["mass"]); T = m * A.G / 4
        p_ideal = 4 * T * np.sqrt(T / (2 * A.RHO * np.pi * D ** 2 / 4))
        minutes = float(s["wh"]) * A.DOD / (p_ideal / (A.FM * A.ETA)) * 60
        self.assertAlmostEqual(minutes, A.ENDURANCE_MIN, places=6)
        self.assertTrue(bool(s["closed"]))

class RolloutTests(unittest.TestCase):
    def test_deterministic(self):
        x, g = np.array([[0.4, 0.4]]), np.array([[0.5, 0.5, 0.5]])
        a, b = A.score(x, g, seed=3)[0], A.score(x, g, seed=3)[0]
        self.assertEqual(float(a[0]), float(b[0]))

    def test_zero_gain_policy_does_not_track(self):
        j = A.score(np.array([[0.4, 0.4]]), np.array([[0.0, 0.0, 0.0]]))[0][0]   # kp = 1, kd = 0.01, ki = 0.1
        self.assertLess(j, -10.0)

    def test_some_policy_beats_the_zero_one(self):
        g = np.random.default_rng(0).random((32, 3))
        j = A.score(np.tile([[0.4, 0.4]], (32, 1)), g)[0]
        zero = A.score(np.array([[0.4, 0.4]]), np.zeros((1, 3)))[0][0]
        self.assertGreater(j.max(), zero + 10.0)

    def test_infeasible_airframe_is_penalised(self):
        self.assertEqual(float(A.score(np.array([[0.0, 1.0]]), np.array([[0.7, 0.7, 0.3]]))[0][0]), -99.0)

    def test_gains_map_to_log_range(self):
        self.assertTrue(np.allclose(A.gains_from_unit(np.zeros(3)), [1.0, 0.01, 0.1]))
        self.assertTrue(np.allclose(A.gains_from_unit(np.ones(3)), [10 ** 2.7, 10.0, 100.0]))


if __name__ == "__main__":
    unittest.main()
