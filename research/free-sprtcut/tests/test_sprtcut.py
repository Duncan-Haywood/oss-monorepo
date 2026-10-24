import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parents[1] / "free-sprtcert"))
from sprtcert import fixed_n, accept_prob_fixed, wald_bounds  # noqa: E402
from sprtcut import run, accept_prob, best_cut, tune  # noqa: E402

P0, P1, A, B = 0.10, 0.05, 0.05, 0.05


class Cut(unittest.TestCase):
    def test_no_early_stop_is_the_fixed_test(self):
        n, c = fixed_n(P0, P1, A, B)
        for p in (P0, P1, 0.07):
            acc, mean_n, left = run(p, P0, P1, -math.inf, math.inf, n)
            self.assertAlmostEqual(acc, 0.0)
            self.assertAlmostEqual(mean_n, n)
            self.assertAlmostEqual(accept_prob(acc, left, c), accept_prob_fixed(n, c, p), places=12)

    def test_mass_conserved(self):
        lo, hi = wald_bounds(A, B)
        acc, _, left = run(0.07, P0, P1, lo, hi, 100)
        self.assertLessEqual(acc + sum(left.values()), 1 + 1e-12)

    def test_best_cut_meets_constraints(self):
        lo, hi = wald_bounds(A, B)
        n, _ = fixed_n(P0, P1, A, B)
        r0, r1 = run(P0, P0, P1, lo, hi, 2 * n), run(P1, P0, P1, lo, hi, 2 * n)
        cut = best_cut(r0, r1, A, B)
        self.assertIsNotNone(cut)
        self.assertLessEqual(cut[1], A)
        self.assertLessEqual(cut[2], B)

    def test_tuned_holds_errors_and_beats_fixed_mean(self):
        n, _ = fixed_n(P0, P1, A, B)
        t = tune(P0, P1, A, B, round(1.5 * n), [0.8, 1.0, 1.2])
        self.assertIsNotNone(t)
        self.assertLessEqual(t["alpha_ach"], A)
        self.assertLessEqual(t["beta_ach"], B)
        self.assertLess(t["obj"], n)

    def test_cap_equal_fixed_n_is_feasible(self):
        # the fixed test is itself inside the family (no early stop), so some tuned test exists at cap = n
        n, _ = fixed_n(P0, P1, A, B)
        self.assertIsNotNone(tune(P0, P1, A, B, n, [1.0, 1.5, 3.0]))


if __name__ == "__main__":
    unittest.main()
