import itertools
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtopt"))
from sprtcert import fixed_n  # noqa: E402
import sprtopt  # noqa: E402
from sprtminimax import solve, minimax, evaluate, worst_case  # noqa: E402

P0, P1 = 0.20, 0.10
GRID = [P1 + (P0 - P1) * i / 4 for i in range(5)]


class Minimax(unittest.TestCase):
    def test_average_lp_sits_inside_the_free_sprtopt_bracket(self):
        n, _ = fixed_n(P0, P1, 0.05, 0.05)
        cap = round(1.25 * n)
        lp = solve(P0, P1, 0.05, 0.05, cap, GRID, "average")["value"]
        b = sprtopt.solve(P0, P1, 0.05, 0.05, cap)
        self.assertGreaterEqual(lp, b["lower"] - 1e-3)  # the dual bound is valid for every test
        self.assertLessEqual(lp, b["upper"] + 1e-6)  # a deterministic feasible test is one randomised test

    def test_policy_reproduces_errors_and_means(self):
        n, _ = fixed_n(P0, P1, 0.05, 0.05)
        cap = round(1.5 * n)
        r = minimax(P0, P1, 0.05, 0.05, cap, P1, P0)
        acc0, rej0, _ = evaluate(r["policy"], P0, cap)
        acc1, rej1, _ = evaluate(r["policy"], P1, cap)
        self.assertLessEqual(acc0, 0.05 + 1e-6)
        self.assertLessEqual(rej1, 0.05 + 1e-6)
        self.assertAlmostEqual(r["worst"], worst_case(r["policy"], cap, P1, P0)[0])
        self.assertLessEqual(r["worst"], n)  # never worse than the fixed test

    def test_minimax_never_worse_than_average_on_the_worst_case(self):
        n, _ = fixed_n(P0, P1, 0.05, 0.05)
        cap = round(1.5 * n)
        a = solve(P0, P1, 0.05, 0.05, cap, GRID, "average")["policy"]
        m = minimax(P0, P1, 0.05, 0.05, cap, P1, P0)
        self.assertLessEqual(m["worst"], worst_case(a, cap, P1, P0)[0] + 1e-3)

    def test_lp_beats_every_deterministic_rule_at_cap_two(self):
        # cap 2, loose errors, so a brute-force search over all 3^(nodes that can continue) deterministic rules is small
        cap, alpha = 2, 0.45
        nodes = [(n, f) for n in range(cap + 1) for f in range(n + 1)]
        best = 1e9
        for choice in itertools.product("arc", repeat=len(nodes)):
            pol = {}
            for nd, c in zip(nodes, choice):
                if nd[0] == cap and c == "c":
                    break
                pol[nd] = (c == "a", c == "r", c == "c")
            else:
                pol = {k: tuple(float(x) for x in v) for k, v in pol.items()}
                a0, _, m0 = evaluate(pol, P0, cap)
                _, r1, m1 = evaluate(pol, P1, cap)
                if a0 <= alpha and r1 <= alpha:
                    best = min(best, max(m0, m1))
        lp = solve(P0, P1, alpha, alpha, cap, [P1, P0], "minimax")["value"]
        self.assertLessEqual(lp, best + 1e-9)

    def test_infeasible_cap_is_reported(self):
        with self.assertRaises(RuntimeError):
            solve(0.05, 0.01, 0.05, 0.05, 20, [0.01, 0.05], "average")


if __name__ == "__main__":
    unittest.main()
