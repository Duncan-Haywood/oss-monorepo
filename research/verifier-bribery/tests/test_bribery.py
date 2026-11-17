import unittest
from verifier_bribery import (Params, verifier_payoffs, bribe_floor, solver_profit_closed_form,
                              solver_profit_bruteforce, collusion_threshold_stake, simulate_verifier_choice)


class T(unittest.TestCase):
    def test_floor_is_indifference(self):
        p = Params(S=4, lam=.5, k=.5, h=.2, phi=.1, J=3)
        for x in (.1, .5, 1):
            a, h = verifier_payoffs(p, x, bribe_floor(p, x))
            self.assertAlmostEqual(a, h, 9)

    def test_no_bribe_recovers_inspection_cheat_rate(self):
        p = Params(S=4, lam=.5, k=.5, h=.25)
        x0 = p.k / (p.lam * p.S + p.h)
        self.assertAlmostEqual(bribe_floor(p, x0), 0, 9)

    def test_closed_form_matches_bruteforce(self):
        cases = [Params(s=1, S=4, m=1), Params(s=3, S=4, m=1), Params(s=3, S=4, m=2, h=.1),
                 Params(s=3, S=4, m=1, phi=.1, J=8), Params(s=5, S=4, m=1, phi=.1, J=8),
                 Params(s=1, S=4, m=3, phi=.05, J=5), Params(s=1, S=.5, k=5, m=1)]
        for p in cases:
            self.assertAlmostEqual(solver_profit_closed_form(p), solver_profit_bruteforce(p), 2, msg=str(p))

    def test_jackpot_covering_check_cost_raises_floor(self):
        p = Params(phi=.1, J=6, k=.5)          # phi*J = .6 >= k
        for x in (.01, .5, 1):
            self.assertGreaterEqual(bribe_floor(p, x), p.lam * p.S + p.h)

    def test_stake_threshold_flips_x_to_one(self):
        base = Params(s=3, m=1)
        Sc = collusion_threshold_stake(base)
        hi = Params(s=3, m=1, S=Sc * 1.2); lo = Params(s=3, m=1, S=Sc * .8)
        # above threshold profit is s*x0 (interior), below it is s - A + C (x = 1)
        self.assertLess(solver_profit_closed_form(hi), hi.s * (hi.k / (hi.lam * hi.S)) + 1e-9)
        self.assertGreater(solver_profit_closed_form(lo), lo.s * min(1, lo.k / (lo.lam * lo.S)))

    def test_more_verifiers_lower_threshold(self):
        s1 = collusion_threshold_stake(Params(s=4, m=1)); s4 = collusion_threshold_stake(Params(s=4, m=4))
        self.assertAlmostEqual(s1 / s4, 4, 6)

    def test_threshold_is_never_below_the_stake_at_which_checking_pays(self):
        # The audit's counterexample (2026-11-13): s=1, lam=k=.5, m=4. The bribe condition alone gives 0.5,
        # but below S=1.0 checking does not pay even unbribed, so the solver keeps the whole saving there.
        p = Params(m=4)
        self.assertAlmostEqual(collusion_threshold_stake(p), 1.0, 9)
        for S in (0.6, 0.9):
            q = Params(m=4, S=S)
            self.assertAlmostEqual(solver_profit_closed_form(q), q.s, 9)
            self.assertAlmostEqual(solver_profit_bruteforce(q), q.s, 6)
        above = Params(m=4, S=1.05)
        self.assertLess(solver_profit_closed_form(above), above.s - 0.01)
        self.assertEqual(collusion_threshold_stake(Params(m=8)), collusion_threshold_stake(Params(m=4)))

    def test_monte_carlo_matches_payoffs(self):
        p = Params(S=4, lam=.5, k=.5, h=.2, phi=.1, J=3)
        x, b = .4, 1.3
        acc, hon = simulate_verifier_choice(p, x, b, tasks=300_000)
        ea, eh = verifier_payoffs(p, x, b)
        self.assertAlmostEqual(acc, ea, 2); self.assertAlmostEqual(hon, eh, 2)


if __name__ == "__main__":
    unittest.main()
