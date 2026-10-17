import random, unittest
from stake_screening import *

P = dict(V=1.0, c=0.3, h=0.5, rho=0.1, thmax=0.6)


class T(unittest.TestCase):
    def test_two_type_rent_is_mimicry_payoff_and_linear_in_stake(self):
        thL, thH, c, rho = 0.05, 0.4, 0.3, 0.1
        for s in (0.0, 0.2, 0.7):
            wH = wage_H_two_type(thH, s, c, rho)
            self.assertAlmostEqual(util(thH, wH, s, c, rho), 0.0, places=12)
            self.assertAlmostEqual(util(thL, wH, s, c, rho), rent_two_type(thL, thH, s, c, rho), places=12)
        slope = rent_two_type(thL, thH, 1.0, c, rho) - rent_two_type(thL, thH, 0.0, c, rho)
        self.assertAlmostEqual(slope, (thH - thL) * (1 + rho) / (1 - thH), places=12)

    def test_unreliable_type_never_wants_the_reliable_contract(self):
        thL, thH, c, rho = 0.05, 0.4, 0.3, 0.1
        for s in (0.0, 0.3, 1.0):
            wL = wage_H_two_type(thL, s, c, rho)  # reliable type's zero-rent contract at the same stake
            self.assertLess(util(thH, wL, s, c, rho), 0)

    def test_serve_both_threshold(self):
        thL, thH, V, c, h = 0.05, 0.4, 1.0, 0.3, 0.5
        for piH in (0.05, 0.2, 0.5, 0.8):
            SL = (1 - thL) * V - thL * h - c
            SH = (1 - thH) * V - thH * h - c
            both = (1 - piH) * (SL - rent_two_type(thL, thH, 0.0, c, 0.1)) + piH * SH
            self.assertEqual(serve_both(thL, thH, piH, V, c, h), both >= (1 - piH) * SL)

    def test_pi_threshold_is_the_switch_point(self):
        thL, thH, V, c, h = 0.05, 0.4, 1.0, 0.3, 0.5
        x = pi_threshold(thL, thH, V, c, h)
        self.assertFalse(serve_both(thL, thH, x - 1e-6, V, c, h))
        self.assertTrue(serve_both(thL, thH, x + 1e-6, V, c, h))

    def test_flat_contract_matches_simulation(self):
        w, _ = best_wage(0.2, P["V"], P["c"], P["h"], P["rho"], P["thmax"])
        rng = random.Random(4)
        prof, part, fr = simulate_flat(w, 0.2, P["V"], P["c"], P["h"], P["rho"], P["thmax"], 400000, rng)
        self.assertAlmostEqual(prof, flat_profit(w, 0.2, P["V"], P["c"], P["h"], P["rho"], P["thmax"]), delta=0.003)
        self.assertAlmostEqual(part, cutoff(w, 0.2, P["c"], P["rho"], P["thmax"]) / P["thmax"], delta=0.003)
        self.assertAlmostEqual(fr, pool_fault_rate(w, 0.2, P["c"], P["rho"], P["thmax"]), delta=0.003)

    def test_best_wage_is_a_stationary_maximum(self):
        for s in (0.0, 0.4):
            w, p = best_wage(s, P["V"], P["c"], P["h"], P["rho"], P["thmax"])
            for dw in (-1e-3, 1e-3):
                self.assertLessEqual(flat_profit(w + dw, s, P["V"], P["c"], P["h"], P["rho"], P["thmax"]), p + 1e-12)

    def test_rent_matches_linear_envelope(self):
        c, rho, tm, s = 0.3, 0.1, 0.6, 0.25
        w = wage_H_two_type(tm, s, c, rho)
        for th in (0.0, 0.2, 0.5):
            self.assertAlmostEqual(util(th, w, s, c, rho), (w + s) * (tm - th), places=12)
            self.assertAlmostEqual((w + s), (c + (1 + rho) * s) / (1 - tm), places=12)

    def test_stake_never_raises_profit(self):
        for h in (0.0, 0.5, 2.0, 5.0):
            for rho in (0.0, 0.1, 0.3):
                s, w, p = best_stake(1.0, 0.3, h, rho, 0.6, smax=1.0, ns=40)
                self.assertEqual(s, 0.0)

    def test_random_menus_do_not_beat_flat(self):
        rng = random.Random(1)
        w, _ = best_wage(0.0, P["V"], P["c"], P["h"], P["rho"], P["thmax"])
        flat = menu_profit([(w, 0.0)], P["V"], P["c"], P["h"], P["rho"], P["thmax"], 400)
        for size in (2, 3):
            best = random_menu_search(P["V"], P["c"], P["h"], P["rho"], P["thmax"], size, 400, rng)
            self.assertLessEqual(best, flat + 2e-3)


if __name__ == "__main__":
    unittest.main()
