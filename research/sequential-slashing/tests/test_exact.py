"""Exact checks added after the 2026-11-07 quality audit
(portfolio/quality/audits/2026-11-07-sequential-slashing.json): the mixture
e-process's validity was untested, and the Ville and peeking tests were Monte
Carlo with loose slack. These use exact enumeration or the boundary DP, and tie
the DP to the shipped run_* functions so the DP is not a copy that drifts."""
import itertools, math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *


def first_cross(ys, c):
    s = 0
    for t, y in enumerate(ys, 1):
        s += y
        if s >= c[t]: return t
    return None


class Exact(unittest.TestCase):
    def test_boundary_dp_reproduces_shipped_rules(self):
        # The DP's boundary must give the same stopping time as run_lr,
        # run_mixture and run_ztest_peeking on the same sequences, honest and not.
        T, rng = 400, random.Random(5)
        rules = [("lr", dict(q=0.3), lambda ys: run_lr(ys, 0.2, 0.3, 0.05)),
                 ("mixture", dict(K=16), lambda ys: run_mixture(ys, 0.2, 0.05, K=16)),
                 ("z", {}, lambda ys: run_ztest_peeking(ys, 0.2, 0.05))]
        for name, kw, run in rules:
            c = boundary(name, 0.2, 0.05, T, **kw)
            for r in (0.2, 0.3):
                for _ in range(40):
                    ys = [1 if rng.random() < r else 0 for _ in range(T)]
                    self.assertEqual(first_cross(ys, c), run(ys), (name, r))

    def test_published_exact_values(self):
        # Matches the audit's independent DP (written outside the repo):
        # peeking z 0.3731, LR 0.0432, oracle mean delay 111.8 at q = 0.3.
        self.assertAlmostEqual(exact_slash_prob("z", 0.2, 0.05, 2000), 0.3731, places=4)
        self.assertAlmostEqual(exact_slash_prob("lr", 0.2, 0.05, 2000, q=0.3), 0.0432, places=4)
        m, P = exact_mean_delay("lr", 0.2, 0.3, 0.05, 3000, q=0.3)
        self.assertAlmostEqual(m, 111.76, places=1)
        self.assertGreater(P, 1 - 1e-9)

    def test_mixture_is_valid_exactly(self):
        # Ville: an honest verifier is slashed with probability <= alpha, at
        # every horizon, for p from 1% to 50%. Dropping the 1/K normaliser
        # gives 0.35 here; a 10% shift of the threshold is also caught at p=0.2.
        for p in (0.01, 0.05, 0.2, 0.5):
            for alpha in (0.05, 0.01):
                r = exact_slash_prob("mixture", p, alpha, 1500, K=32)
                self.assertLessEqual(r, alpha, (p, alpha))
        self.assertGreater(exact_slash_prob("mixture", 0.2, 0.05, 2000, K=32), 0.025)

    def test_log_grid_detects_small_rates(self):
        # p = 1%, cheater at 1.5%: the uniform grid's smallest bet (1/64 of 1/p)
        # loses money on average, so it detects only ~26% within 12x Wald's
        # bound; the log-spaced grid stays valid and detects essentially all.
        p, q, T = 0.01, 0.015, 33041
        self.assertLess(exact_mean_delay("mixture", p, q, 0.05, T, K=32)[1], 0.5)
        m, P = exact_mean_delay("mixture", p, q, 0.05, T, K=32, spacing="log")
        self.assertGreater(P, 0.99)
        self.assertLess(m, 1.6 * wald_lower(0.05, q, p))
        self.assertLessEqual(exact_slash_prob("mixture", p, 0.05, T, K=32, spacing="log"), 0.05)

    def test_lr_is_valid_exactly(self):
        for p, q in ((0.01, 0.02), (0.2, 0.3), (0.5, 0.6)):
            self.assertLessEqual(exact_slash_prob("lr", p, 0.05, 1500, q=q), 0.05)

    def test_peeking_inflation_exact(self):
        # Nominal 5%, exact 37%; grows with the horizon.
        a = exact_slash_prob("z", 0.2, 0.05, 500)
        b = exact_slash_prob("z", 0.2, 0.05, 2000)
        self.assertGreater(a, 0.2)
        self.assertGreater(b, a)

    def test_mixture_mean_one_by_enumeration(self):
        # E[M_n] = 1 under H0, summed over all 2^10 outcome sequences.
        p, n = 0.2, 10
        lams = mixture_grid(p, 8)
        tot = 0.0
        for ys in itertools.product((0, 1), repeat=n):
            w = math.prod(p if y else 1 - p for y in ys)
            m = sum(math.prod(bet_step(y, p, l) for y in ys) for l in lams) / len(lams)
            tot += w * m
        self.assertAlmostEqual(tot, 1.0, places=12)


class TimeVarying(unittest.TestCase):
    PS = [0.03, 0.2, 0.5, 0.11, 0.7, 0.05, 0.3, 0.9, 0.15, 0.4]

    def test_tv_mean_one_by_enumeration(self):
        for two in (False, True):
            tot = 0.0
            for ys in itertools.product((0, 1), repeat=len(self.PS)):
                w = math.prod(p if y else 1 - p for y, p in zip(ys, self.PS))
                *_, lm = mixture_tv_path(ys, self.PS, K=8, two_sided=two)
                tot += w * math.exp(lm)
            self.assertAlmostEqual(tot, 1.0, places=12)

    def test_tv_reduces_to_constant_mixture(self):
        # With p_t = p the up-bets c/p are mixture_grid(p, K); same stopping times.
        rng = random.Random(2)
        for _ in range(20):
            ys = [1 if rng.random() < 0.3 else 0 for _ in range(500)]
            self.assertEqual(run_mixture_tv(ys, [0.2] * 500, 0.05, K=16),
                             run_mixture(ys, 0.2, 0.05, K=16))

    def test_tv_valid_and_powerful(self):
        rng = random.Random(9)
        hon = cheat = over = 0
        N, T = 300, 600
        for _ in range(N):
            ps = [rng.choice((0.02, 0.05, 0.1, 0.3)) for _ in range(T)]
            ys = [1 if rng.random() < p else 0 for p in ps]
            hon += run_mixture_tv(ys, ps, 0.05, K=16, two_sided=True) is not None
            yc = [1 if rng.random() < min(1, 2 * p) else 0 for p in ps]
            cheat += run_mixture_tv(yc, ps, 0.05, K=16) is not None
            yo = [1 if rng.random() < p / 3 else 0 for p in ps]
            over += run_mixture_tv(yo, ps, 0.05, K=16, two_sided=True) is not None
        # Ville gives <= 0.05; 300 trials put 3 SE at about 0.038.
        self.assertLessEqual(hon / N, 0.05 + 0.038)
        self.assertGreater(cheat / N, 0.95)    # under-reports faults by half
        self.assertGreater(over / N, 0.9)      # over-reports faults threefold
        # one-sided up-bets cannot catch over-reporting
        self.assertIsNone(run_mixture_tv([0] * 600, [0.3] * 600, 0.05, K=16))


class Inputs(unittest.TestCase):
    def test_rejects_bad_inputs(self):
        with self.assertRaises(ValueError): run_lr([1], 0.2, 0.1, 0.05)    # q <= p
        with self.assertRaises(ValueError): run_lr([1], 0.0, 0.3, 0.05)
        with self.assertRaises(ValueError): kl(0.3, 1.0)
        with self.assertRaises(ValueError): mixture_grid(0.0)
        with self.assertRaises(ValueError): wald_lower(0.05, 0.2, 0.2)
        with self.assertRaises(ValueError): false_slash_rate("zz", 0.2, 0.05, 10, 1)
        with self.assertRaises(ValueError): false_slash_rate("lr", 0.2, 0.05, 10, 1)
        with self.assertRaises(ValueError): run_mixture([1], 0.2, 1.5)
        with self.assertRaises(ValueError): run_mixture_tv([1], [1.0], 0.05)
        with self.assertRaises(ValueError): boundary("zz", 0.2, 0.05, 10)
        with self.assertRaises(ValueError): mixture_grid(0.2, 8, spacing="cubic")


if __name__ == "__main__":
    unittest.main()
