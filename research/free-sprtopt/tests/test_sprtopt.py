import itertools
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n, accept_prob_fixed  # noqa: E402
from sprtopt import bayes, evaluate, solve  # noqa: E402

P0, P1 = 0.10, 0.05


class Opt(unittest.TestCase):
    def test_fixed_test_is_in_the_family(self):
        n, c = fixed_n(P0, P1, 0.05, 0.05)
        dec = [["c"] * (k + 1) for k in range(n + 1)]
        dec[n] = ["a" if f <= c else "r" for f in range(n + 1)]
        for p in (P0, P1, 0.07):
            acc, mean_n = evaluate(dec, p, n)
            self.assertAlmostEqual(mean_n, n)
            self.assertAlmostEqual(acc, accept_prob_fixed(n, c, p), places=12)

    def test_value_is_the_lagrangian_of_the_rule(self):
        c0, c1, cap = 120.0, 90.0, 40
        v, dec = bayes(P0, P1, c0, c1, cap)
        a0, m0 = evaluate(dec, P0, cap)
        a1, m1 = evaluate(dec, P1, cap)
        self.assertAlmostEqual(v, m0 + m1 + c0 * a0 + c1 * (1 - a1), places=9)

    def test_backward_induction_beats_every_policy_at_tiny_cap(self):
        c0, c1, cap = 7.0, 5.0, 3
        v, _ = bayes(P0, P1, c0, c1, cap)
        states = [(n, f) for n in range(cap + 1) for f in range(n + 1)]
        best = math.inf
        for choice in itertools.product("arc", repeat=len(states)):
            dec = [[""] * (n + 1) for n in range(cap + 1)]
            for (n, f), d in zip(states, choice):
                dec[n][f] = "a" if (n == cap and d == "c") else d
            a0, m0 = evaluate(dec, P0, cap)
            a1, m1 = evaluate(dec, P1, cap)
            best = min(best, m0 + m1 + c0 * a0 + c1 * (1 - a1))
        self.assertAlmostEqual(v, best, places=9)

    def test_bounds_bracket_and_hold_errors(self):
        n, _ = fixed_n(P0, P1, 0.05, 0.05)
        r = solve(P0, P1, 0.05, 0.05, n)
        self.assertLessEqual(r["lower"], r["upper"] + 1e-9)
        self.assertLessEqual(r["A"], 0.05)
        self.assertLessEqual(r["B"], 0.05)
        self.assertLess(r["upper"], n)        # cheaper than the fixed test
        self.assertLess(r["upper"] / r["lower"], 1.05)

    def test_larger_cap_never_costs_more(self):
        a = solve(0.20, 0.10, 0.05, 0.05, 135)["lower"]
        b = solve(0.20, 0.10, 0.05, 0.05, 200)["lower"]
        self.assertLessEqual(b, a + 1e-9)


if __name__ == "__main__":
    unittest.main()
