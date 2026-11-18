import math
import unittest

from sag_twin.model import (cold_endurance, current, voltage, twin_current, eta, s_cut, max_power, endurance, twin_endurance, simulate,
                            fit_resistance, emf, VC)


class T(unittest.TestCase):
    def test_current_solves_power_balance(self):
        for rho in (0.0, 1.0):
            for s in (1.0, 0.5, 0.1):
                i = current(s, 0.3, rho=rho)
                self.assertAlmostEqual(voltage(s, 0.3, rho=rho) * i, 0.3 / 4, places=12)

    def test_flat_emf_endurance_ratio_is_eta(self):
        for u in (0.1, 0.5, 0.9, 1.0):
            # d = 0, vc = 0: real endurance / twin endurance = eta(u) exactly
            real = endurance(u, s_to=0.0, d=0.0, vc=0.0)
            twin = twin_endurance(u, d=0.0)
            self.assertAlmostEqual(real / twin, eta(u), places=6)
        self.assertAlmostEqual(eta(1.0), 0.5)

    def test_fold_has_no_current(self):
        self.assertIsNone(current(1.0, 1.0001, d=0.0))
        self.assertIsNotNone(current(1.0, 1.0, d=0.0))

    def test_cutoff_closed_form_matches_bisection(self):
        for rho in (0.0, 1.0):
            for u in (0.1, 0.3, 0.6):
                sc = s_cut(u, rho=rho)
                lo, hi = 0.0, 1.0
                for _ in range(60):
                    mid = 0.5 * (lo + hi)
                    v = voltage(mid, u, rho=rho)
                    if v is not None and v >= VC:
                        hi = mid
                    else:
                        lo = mid
                self.assertAlmostEqual(sc, hi, places=9)

    def test_max_power_inverts_cutoff(self):
        for rho in (0.0, 1.0):
            for s in (0.4, 0.8, 1.0):
                self.assertAlmostEqual(s_cut(max_power(s, rho=rho), rho=rho), s, places=9)

    def test_simulation_agrees_with_quadrature(self):
        for rho in (0.0, 1.0):
            t, s = simulate(0.3, dt=2e-4, rho=rho)
            self.assertAlmostEqual(t, endurance(0.3, rho=rho), delta=2e-3)

    def test_twin_overestimates_and_cannot_start_when_real_cannot(self):
        self.assertGreater(twin_endurance(0.3), endurance(0.3))
        self.assertIsNone(s_cut(0.9))
        self.assertEqual(endurance(0.9), 0.0)

    def test_resistance_fit_recovers_truth(self):
        i = [0.05 * k for k in range(1, 20)]
        e = [1.0] * len(i)
        v = [1.0 - 0.8 * x for x in i]
        r, _ = fit_resistance(i, e, v)
        self.assertAlmostEqual(r, 0.8, places=12)

    def test_twin_current_is_lower(self):
        self.assertLess(twin_current(0.7, 0.3), current(0.7, 0.3))

    def test_cold_cell_ratio_is_warm_ratio_at_k_u0(self):
        # Quality audit 2026-11-17: run.py compared the cold cell's time in its own (k times longer) units
        # with the twin's warm units, understating real/twin by a factor k (0.286 instead of 0.571 at k = 2).
        for k in (1.0, 1.5, 2.0, 3.0):
            cold = cold_endurance(k, 0.2) / twin_endurance(0.2)
            warm = endurance(k * 0.2) / twin_endurance(k * 0.2)
            self.assertAlmostEqual(cold, warm, places=9)
        self.assertAlmostEqual(cold_endurance(2.0, 0.2) / twin_endurance(0.2), 0.5712, places=4)


if __name__ == "__main__":
    unittest.main()
