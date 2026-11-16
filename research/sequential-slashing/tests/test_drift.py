"""Pooling drifting reports, and the 'scale' bet family (added 2026-11-16, PR 16632)."""
import itertools, math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sequential_slashing import *
from sequential_slashing.exact import exact_slash_prob


class Drift(unittest.TestCase):
    PS = [0.1, 0.5, 0.3, 0.05, 0.7, 0.2, 0.4, 0.15, 0.6, 0.25, 0.1, 0.8, 0.35, 0.5]

    def _exact_tv(self, alpha, **kw):
        fs = 0.0
        for ys in itertools.product((0, 1), repeat=len(self.PS)):
            if run_mixture_tv(ys, self.PS, alpha, K=8, **kw) is not None:
                pr = 1.0
                for y, p in zip(ys, self.PS): pr *= p if y else 1 - p
                fs += pr
        return fs

    def test_scale_family_valid_exactly(self):
        # All 2^14 outcome paths under varying reports: P(slash) <= alpha, and not vacuous.
        for two, fam in itertools.product((False, True), ("scale", "both")):
            fs = self._exact_tv(0.25, two_sided=two, family=fam, spacing="log")
            self.assertLessEqual(fs, 0.25, msg=two)
            self.assertGreater(fs, 0.02, msg=two)

    def test_scale_factors_are_the_likelihood_ratio(self):
        # One component, r = scale_grid value: factor equals Bern(r p)/Bern(p).
        r = scale_grid(4)[2]
        for p in (0.02, 0.1, 0.3):
            lm = list(mixture_tv_path([1], [p], K=4, family="scale"))[0]
            lm0 = list(mixture_tv_path([0], [p], K=4, family="scale"))[0]
            ws1 = [math.log(min(r_, 1 + 0.999 * (1 - p) / p)) for r_ in scale_grid(4)]
            self.assertAlmostEqual(lm, math.log(sum(math.exp(w) for w in ws1) / 4), places=12)
            ws0 = [math.log(1 - min((r_ - 1) * p / (1 - p), 0.999)) for r_ in scale_grid(4)]
            self.assertAlmostEqual(lm0, math.log(sum(math.exp(w) for w in ws0) / 4), places=12)
        self.assertGreater(r, 1)

    def test_scale_down_bets_are_the_likelihood_ratio_of_p_over_r(self):
        # Two-sided, one outcome: mean over 2K components of Bern(rp)/Bern(p) and Bern(p/r)/Bern(p).
        p, K = 0.2, 4
        for y in (0, 1):
            lm = list(mixture_tv_path([y], [p], K=K, two_sided=True, family="scale"))[0]
            comps = []
            for r in scale_grid(K):
                q_up = min(r * p, 1 - 0.001 * (1 - p))      # cap: up fraction <= 0.999
                comps.append(q_up / p if y else (1 - q_up) / (1 - p))
                q_dn = p / r
                comps.append(q_dn / p if y else (1 - q_dn) / (1 - p))
            self.assertAlmostEqual(lm, math.log(sum(comps) / (2 * K)), places=12, msg=y)

    def test_pooling_drifting_reports_is_invalid(self):
        # An honest verifier reporting 0.4 then 0.1: the constant-p mixture at the
        # average report is not an e-process for it. Exact first-300-round slash
        # probability under Bernoulli(0.4) against the pooled rule is far above alpha.
        pbar = (0.4 * 300 + 0.1 * 1700) / 2000
        self.assertGreater(exact_slash_prob("mixture", pbar, 0.05, 300, r=0.4, K=32), 0.99)

    def test_per_round_holds_on_drift(self):
        rng = random.Random(4)
        ps = [0.4] * 300 + [0.1] * 700
        hits = sum(run_mixture_tv([1 if rng.random() < x else 0 for x in ps], ps, 0.05, K=16) is not None
                   for _ in range(200))
        self.assertLessEqual(hits / 200, 0.05 + 0.04)

    def test_scale_family_faster_on_scaling_cheater(self):
        rng = random.Random(9)
        add, sc = [], []
        for _ in range(60):
            ps = [0.05 + 0.3 * rng.random() for _ in range(3000)]
            ys = [1 if rng.random() < 1.5 * x else 0 for x in ps]
            add.append(run_mixture_tv(ys, ps, 0.05, K=16) or 3000)
            sc.append(run_mixture_tv(ys, ps, 0.05, K=16, family="scale") or 3000)
        self.assertLess(sum(sc), sum(add))

    def test_both_is_the_average_of_the_two_families(self):
        rng = random.Random(2)
        ps = [0.02 + 0.3 * rng.random() for _ in range(50)]
        ys = [1 if rng.random() < x else 0 for x in ps]
        for two in (False, True):
            a = list(mixture_tv_path(ys, ps, K=8, two_sided=two, spacing="log"))[-1]
            b = list(mixture_tv_path(ys, ps, K=8, two_sided=two, family="scale"))[-1]
            c = list(mixture_tv_path(ys, ps, K=8, two_sided=two, spacing="log", family="both"))[-1]
            self.assertAlmostEqual(math.exp(c), (math.exp(a) + math.exp(b)) / 2, places=9)

    def test_family_rejected(self):
        with self.assertRaises(ValueError): run_mixture_tv([1], [0.2], 0.05, family="nope")


if __name__ == "__main__":
    unittest.main()
