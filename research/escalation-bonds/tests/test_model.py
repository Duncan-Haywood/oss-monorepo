import random
import unittest
from escalation_bonds import *

INF = float("inf")


class T(unittest.TestCase):
    def test_totals(self):
        self.assertEqual(totals(1.0, 2.0, 4), (1 + 4, 2 + 8))
        self.assertEqual(totals(1.0, 2.0, 1), (1.0, 0))

    def test_one_shot_threshold(self):
        # R=1: C posts b and the oracle rules; C challenges iff eps V > (1-eps) b
        self.assertAlmostEqual(deterrence_bond(100, 0.1, 2.0, 1), 0.1 * 100 / 0.9)
        self.assertTrue(challenges(100, 0.1, 10.0, 2.0, 1))
        self.assertFalse(challenges(100, 0.1, 12.0, 2.0, 1))

    def test_deterrence_closed_form_matches_game(self):
        rng = random.Random(3)
        for _ in range(150):
            V, eps, g, R = rng.uniform(1, 20), rng.choice([0.01, 0.1, 0.4]), rng.uniform(1.1, 3), rng.randint(1, 9)
            cf, num = deterrence_bond(V, eps, g, R), deterrence_bond_search(V, eps, g, R)
            self.assertAlmostEqual(cf, num, delta=1e-6 * max(1, cf))

    def test_spe_is_nash_of_stop_round_form(self):
        rng = random.Random(4)
        for _ in range(120):
            V, eps, g, R, b = rng.uniform(1, 20), rng.choice([0, 0.05, 0.3]), rng.uniform(1.1, 3), rng.randint(1, 7), rng.uniform(.1, 2)
            BC = rng.choice([INF, rng.uniform(1, 40)]); BD = rng.choice([INF, rng.uniform(1, 40)])
            uc, ud, _ = solve(V, eps, b, g, R, BC, BD)
            self.assertTrue(any(abs(uc - x) < 1e-7 and abs(ud - y) < 1e-7
                                for x, y in nash_outcomes_stop_round(V, eps, b, g, R, BC, BD)))

    def test_budget_race_closed_form(self):
        rng = random.Random(5)
        for _ in range(200):
            g, R, b, V = rng.uniform(1.1, 3), rng.randint(1, 10), rng.uniform(.1, 2), rng.uniform(1, 20)
            BC, BD = rng.uniform(1, 80), rng.uniform(1, 80)
            self.assertEqual(challenges(V, 0.0, b, g, R, BC, BD), attacker_wins_budget_race(b, g, R, BC, BD))

    def test_defender_needs_at_most_gamma_times_attacker(self):
        rng = random.Random(6)
        for g in (1.3, 2.0, 3.5):
            for _ in range(200):
                BC = 10 ** rng.uniform(0, 5)
                need = defender_safe_budget(1.0, g, 40, BC)
                self.assertLessEqual(need, g * BC + 1e-9)
                self.assertFalse(attacker_wins_budget_race(1.0, g, 40, BC, need))
                if need > 0:
                    self.assertTrue(attacker_wins_budget_race(1.0, g, 40, BC, need * 0.999))

    def test_bound_is_attained(self):
        # attacker capital exactly equal to a cumulative outlay forces defender to hold gamma times it
        g, b = 2.0, 1.0
        C = attacker_outlays(b, g, 40)[3][1]
        self.assertAlmostEqual(defender_safe_budget(b, g, 40, C), g * C)

    def test_escalation_keeps_deterrence_outlay_nearly_flat(self):
        base = deterrence_bond(1000, 0.02, 2.0, 1)
        lim = 0.02 * 1000 / (1 - 0.02 * (1 + 1 / 2.0))
        for R in (5, 11, 21):
            out = deterrence_bond(1000, 0.02, 2.0, R) * totals(1.0, 2.0, R)[0]
            self.assertGreater(out, base); self.assertLess(out, lim + 1e-9)
        self.assertLess(deterrence_bond(1000, 0.02, 2.0, 21), 1e-4)

    def test_lockup_and_griefing(self):
        d, c = lockup_cost(1.0, 2.0, 4, 0.01)
        self.assertAlmostEqual(d, 0.01 * (2 * 3 + 8 * 1))
        self.assertAlmostEqual(c, 0.01 * (1 * 4 + 4 * 2))
        self.assertLess(griefing_ratio(1.0, 2.0, 5, 0.001, 0.02), 0.01)


if __name__ == "__main__":
    unittest.main()
