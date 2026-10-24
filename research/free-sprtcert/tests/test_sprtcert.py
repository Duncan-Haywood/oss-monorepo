import sys, unittest, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sprtcert import sprt, fixed_n, accept_prob_fixed, wald_bounds


class Tests(unittest.TestCase):
    def test_probabilities_sum_to_one(self):
        r = sprt(0.03, 0.05, 0.01, 0.05, 0.05, nmax=3000)
        self.assertAlmostEqual(r["accept"] + r["reject"] + r["undecided"], 1.0, places=9)

    def test_wald_bounds_signs(self):
        lo, hi = wald_bounds(0.05, 0.05)
        self.assertLess(lo, 0)
        self.assertGreater(hi, 0)
        self.assertAlmostEqual(hi, -lo)

    def test_fixed_n_meets_both_errors_and_is_minimal(self):
        n, c = fixed_n(0.10, 0.05, 0.05, 0.05)
        self.assertLessEqual(accept_prob_fixed(n, c, 0.10), 0.05)
        self.assertGreaterEqual(accept_prob_fixed(n, c, 0.05), 0.95)
        for m in range(1, n):  # no smaller n works
            self.assertTrue(all(not (accept_prob_fixed(m, k, 0.10) <= 0.05 and accept_prob_fixed(m, k, 0.05) >= 0.95) for k in range(m + 1)))

    def test_sprt_errors_near_nominal(self):
        r0 = sprt(0.10, 0.10, 0.05, 0.05, 0.05, nmax=4000)
        r1 = sprt(0.05, 0.10, 0.05, 0.05, 0.05, nmax=4000)
        self.assertLess(r0["accept"], 0.07)
        self.assertLess(1 - r1["accept"] - r1["undecided"], 0.07)

    def test_asn_small_when_clear(self):
        n, _ = fixed_n(0.10, 0.05, 0.05, 0.05)
        self.assertLess(sprt(0.05, 0.10, 0.05, 0.05, 0.05, nmax=4000)["asn"], n)


if __name__ == "__main__":
    unittest.main()
