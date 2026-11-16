"""Validity checks that call the shipped decision rules, with no Monte Carlo slack.

Added after the 2026-11-07 quality audit (portfolio/quality/audits/
2026-11-07-sequential-slashing.json): a mutation that dropped the mixture's /K
normaliser was caught only by an incidental delay-ordering test.
"""
import itertools, math, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *
from sequential_slashing.model import _first_stop_s


def binom_pmf(t, s, p):
    return math.comb(t, s) * p ** s * (1 - p) ** (t - s)


class Exact(unittest.TestCase):
    def test_mixture_is_mean_one_at_every_t(self):
        # E_H0[E_t] = 1 exactly for a test martingale; dropping /K makes it K.
        p = 0.2
        for K in (1, 8, 32):
            for t in (1, 5, 40, 200):
                m = sum(binom_pmf(t, s, p) * math.exp(log_mixture(t, s, p, K)) for s in range(t + 1))
                self.assertAlmostEqual(m, 1.0, places=9, msg=(K, t))

    def test_lr_is_mean_one(self):
        for t in (1, 10, 100):
            m = sum(binom_pmf(t, s, 0.2) * math.exp(log_lr(t, s, 0.2, 0.3)) for s in range(t + 1))
            self.assertAlmostEqual(m, 1.0, places=9)

    def test_ville_exact_for_e_processes(self):
        for alpha in (0.2, 0.05, 0.01):
            for method, kw in (("lr", {"q": 0.3}), ("mixture", {"K": 16})):
                fs = exact_false_slash(method, 0.2, alpha, 800, **kw)
                self.assertLessEqual(fs, alpha, msg=(method, alpha, fs))
                self.assertGreater(fs, 0.3 * alpha, msg=(method, alpha, fs))  # not vacuous

    def test_exact_values_match_independent_recomputation(self):
        # The auditor's own DP (no shared code) gave 0.3731, 0.0432 and 111.8.
        self.assertAlmostEqual(exact_false_slash("z", 0.2, 0.05, 2000), 0.3731, places=4)
        self.assertAlmostEqual(exact_false_slash("lr", 0.2, 0.05, 2000, q=0.3), 0.0432, places=4)
        P, m = exact_detection("lr", 0.2, 0.3, 0.05, 3000)
        self.assertGreater(P, 0.999999)
        self.assertAlmostEqual(m, 111.8, places=1)

    def test_exact_dp_matches_path_enumeration(self):
        # Brute force over all 2^T outcome sequences through the run_* simulators.
        T, p, a = 12, 0.3, 0.2
        for method, run in (("lr", lambda ys: run_lr(ys, p, 0.6, a)),
                            ("mixture", lambda ys: run_mixture(ys, p, a, K=8)),
                            ("z", lambda ys: run_ztest_peeking(ys, p, a, t0=3))):
            kw = {"q": 0.6} if method == "lr" else {"K": 8} if method == "mixture" else {"t0": 3}
            brute = [0.0] * T
            for ys in itertools.product((0, 1), repeat=T):
                tau = run(ys)
                if tau: brute[tau - 1] += p ** sum(ys) * (1 - p) ** (T - sum(ys))
            dp = exact_stop_dist(method, p, a, T, **kw)
            for b, d in zip(brute, dp): self.assertAlmostEqual(b, d, places=12, msg=method)

    def test_stopping_set_is_upper_interval(self):
        # _first_stop_s relies on monotonicity in s; check it on a grid.
        for method, kw in (("lr", {"q": 0.3}), ("mixture", {"K": 16}), ("z", {})):
            for t in (1, 7, 30, 31, 150):
                k = _first_stop_s(method, t, 0.2, 0.05, **kw)
                for s in range(t + 1):
                    self.assertEqual(stopped(method, t, s, 0.2, 0.05, **kw), s >= k, msg=(method, t, s))

    def test_peeking_far_above_nominal(self):
        self.assertGreater(exact_false_slash("z", 0.2, 0.05, 1000), 0.3)


class Varying(unittest.TestCase):
    def test_constant_reports_reduce_to_run_mixture(self):
        import random
        rng = random.Random(3)
        for _ in range(40):
            ys = [1 if rng.random() < 0.3 else 0 for _ in range(400)]
            self.assertEqual(run_mixture_varying(ys, [0.2] * 400, 0.05, K=16), run_mixture(ys, 0.2, 0.05, K=16))

    def test_factors_mean_one_and_positive(self):
        for p in (0.01, 0.2, 0.5, 0.97):
            for c in mixture_fractions(16):
                for sd in ("greater", "less"):
                    f1, f0 = mixture_varying_factors(1, p, c, sd), mixture_varying_factors(0, p, c, sd)
                    self.assertAlmostEqual(p * f1 + (1 - p) * f0, 1.0)
                    self.assertGreater(min(f0, f1), 0)

    def test_ville_exact_by_enumeration_with_varying_reports(self):
        # Exact false-slash probability over all 2^14 paths, reports varying by round.
        ps = [0.1, 0.5, 0.3, 0.05, 0.7, 0.2, 0.4, 0.15, 0.6, 0.25, 0.1, 0.8, 0.35, 0.5]
        a = 0.25
        for side in ("greater", "less", "two-sided"):
            fs = 0.0
            for ys in itertools.product((0, 1), repeat=len(ps)):
                if run_mixture_varying(ys, ps, a, K=8, side=side):
                    pr = 1.0
                    for y, p in zip(ys, ps): pr *= p if y else 1 - p
                    fs += pr
            self.assertLessEqual(fs, a, msg=side)
            self.assertGreater(fs, 0.02, msg=side)

    def test_two_sided_catches_over_reporting(self):
        import random
        rng = random.Random(5)
        ps = [0.1 + 0.3 * rng.random() for _ in range(2000)]
        ys = [1 if rng.random() < p / 2 else 0 for p in ps]       # true rate half the report
        self.assertIsNone(run_mixture_varying(ys, ps, 0.05, side="greater"))
        self.assertIsNotNone(run_mixture_varying(ys, ps, 0.05, side="two-sided"))
        self.assertIsNotNone(run_mixture_varying(ys, ps, 0.05, side="less"))


class Inputs(unittest.TestCase):
    def test_rejects_bad_inputs(self):
        for bad in (lambda: run_lr([1], 0.2, 0.2, 0.05), lambda: run_lr([1], 0.3, 0.2, 0.05),
                    lambda: run_lr([1], 0.0, 0.2, 0.05), lambda: kl(0.3, 1.0),
                    lambda: run_mixture([1], 0.2, 1.5), lambda: false_slash_rate("zz", 0.2, 0.05, 10, 1),
                    lambda: false_slash_rate("lr", 0.2, 0.05, 10, 1),   # q missing
                    lambda: run_mixture_varying([1], [1.0], 0.05), lambda: mixture_grid(0.2, 0)):
            with self.assertRaises((ValueError, TypeError)): bad()

    def test_wilson(self):
        lo, hi = wilson(38, 1000)
        self.assertAlmostEqual(lo, 0.0278, places=3); self.assertAlmostEqual(hi, 0.0517, places=3)


if __name__ == "__main__":
    unittest.main()
