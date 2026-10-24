import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from llmci import estimators as E  # noqa: E402


def corpus(n, p, sens, spec, rng):
    h = [int(rng.random() < p) for _ in range(n)]
    f = [int(rng.random() < (sens if x else 1 - spec)) for x in h]
    return h, f


class HandComputed(unittest.TestCase):
    # f_all: 10 items, 4 ones. Audit of 4: h=[1,0,1,1], f=[1,0,0,1] -> d=[0,0,1,0].
    f_all = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    f_gold, h_gold = [1, 0, 0, 1], [1, 0, 1, 1]

    def test_ppi_point_and_se(self):
        e = E.ppi(self.f_all, self.f_gold, self.h_gold)
        self.assertAlmostEqual(e.est, 0.4 + 0.25)
        # var(f_all)=0.2667/10, var(d)=0.25/4
        self.assertAlmostEqual(e.se, math.sqrt(0.24 / 0.9 / 10 * 1 + 0.25 / 4), places=6)

    def test_lambda_endpoints(self):
        h = E.human_only(self.h_gold)
        e0 = E.ppi_pp(self.f_all, self.f_gold, self.h_gold, lam=0.0)
        self.assertAlmostEqual(e0.est, h.est)
        self.assertAlmostEqual(e0.se, h.se)
        e1 = E.ppi_pp(self.f_all, self.f_gold, self.h_gold, lam=1.0)
        e = E.ppi(self.f_all, self.f_gold, self.h_gold)
        self.assertEqual(e1, e)

    def test_stratified_equals_ppi_point_when_proportional(self):
        # strata = coder label; audit proportional to stratum size (2 of 4 ones... use 4 of 10)
        strata = self.f_all
        audit = {1: [(1, 1), (1, 1)], 0: [(0, 0), (0, 1)]}
        # d: stratum 1 mean 0, stratum 0 mean 0.5 ; weights .4/.6
        e = E.stratified(self.f_all, strata, audit)
        self.assertAlmostEqual(e.est, 0.4 + 0.6 * 0.5)

    def test_missing_stratum_raises(self):
        with self.assertRaises(ValueError):
            E.stratified([1, 0, 1, 0], [1, 0, 1, 0], {1: [(1, 1), (1, 0)]})


class ClosedForms(unittest.TestCase):
    def test_audit_size_rule_matches_monte_carlo_widths(self):
        # At the break-even n the mean PPI and human-only SEs agree (H5 in miniature).
        p, sens, spec, N = 0.3, 0.8, 0.9, 20000
        ratio, nmax = E.audit_size_ppi(p, sens, spec, N)
        rng = random.Random(7)
        h, f = corpus(N, p, sens, spec, rng)
        n = int(nmax)
        se_p = se_h = 0.0
        reps = 150
        for _ in range(reps):
            idx = rng.sample(range(N), n)
            hg, fg = [h[i] for i in idx], [f[i] for i in idx]
            se_p += E.ppi(f, fg, hg).se
            se_h += E.human_only(hg).se
        self.assertAlmostEqual(se_p / se_h, 1.0, delta=0.03)

    def test_weak_coder_gives_no_gain(self):
        ratio, nmax = E.audit_size_ppi(0.3, 0.55, 0.55, 1000)
        self.assertGreaterEqual(ratio, 1)
        self.assertEqual(nmax, 0)


class Validity(unittest.TestCase):
    def test_ppi_unbiased_and_covers(self):
        rng = random.Random(11)
        N, hit, bias, reps = 3000, 0, 0.0, 400
        h, f = corpus(N, 0.2, 0.7, 0.9, rng)
        truth = sum(h) / N
        for _ in range(reps):
            idx = rng.sample(range(N), 150)
            e = E.ppi_pp(f, [f[i] for i in idx], [h[i] for i in idx], lam=None)
            hit += E.covers(e, truth)
            bias += e.est - truth
        self.assertGreater(hit / reps, 0.91)
        self.assertLess(abs(bias / reps), 0.005)

    def test_naive_is_biased_and_does_not_cover(self):
        rng = random.Random(12)
        h, f = corpus(4000, 0.1, 0.3, 0.95, rng)
        self.assertFalse(E.covers(E.naive(f), sum(h) / len(h)))

    def test_stratified_by_coder_label_covers_with_finite_population_se(self):
        rng = random.Random(13)
        N = 4000
        h, f = corpus(N, 0.2, 0.6, 0.97, rng)
        truth = sum(h) / N
        pos = [i for i in range(N) if f[i]]
        neg = [i for i in range(N) if not f[i]]
        hit, reps = 0, 400
        for _ in range(reps):
            a1, a0 = rng.sample(pos, 100), rng.sample(neg, 200)
            audit = {1: [(f[i], h[i]) for i in a1], 0: [(f[i], h[i]) for i in a0]}
            hit += E.covers(E.stratified(f, f, audit), truth)
        self.assertGreater(hit / reps, 0.91)

    def test_group_weighted_fixes_pooled_bias_under_group_shift(self):
        # Two groups, coder sensitivity differs; audit over-samples the small group.
        rng = random.Random(14)
        NA, NB = 3000, 1000
        hA, fA = corpus(NA, 0.3, 0.9, 0.95, rng)
        hB, fB = corpus(NB, 0.3, 0.3, 0.95, rng)
        h, f = hA + hB, fA + fB
        truth = sum(h) / len(h)
        pooled_err, grouped_err, reps = 0.0, 0.0, 300
        for _ in range(reps):
            ia, ib = rng.sample(range(NA), 100), rng.sample(range(NB), 100)
            pg = [(fA[i], hA[i]) for i in ia] + [(fB[i], hB[i]) for i in ib]
            e_pool = E.ppi(f, [x for x, _ in pg], [y for _, y in pg])
            ea = E.ppi(fA, [fA[i] for i in ia], [hA[i] for i in ia])
            eb = E.ppi(fB, [fB[i] for i in ib], [hB[i] for i in ib])
            e_grp = E.group_weighted({"A": NA, "B": NB}, {"A": ea, "B": eb})
            pooled_err += e_pool.est - truth
            grouped_err += e_grp.est - truth
        self.assertGreater(abs(pooled_err / reps), 0.03)
        self.assertLess(abs(grouped_err / reps), 0.01)

    def test_confusion_correction_recovers_prevalence(self):
        rng = random.Random(15)
        N = 20000
        h, f = corpus(N, 0.15, 0.8, 0.9, rng)
        idx = rng.sample(range(N), 800)
        e = E.confusion_correction(f, [f[i] for i in idx], [h[i] for i in idx])
        self.assertTrue(E.covers(e, sum(h) / N, z=3))

    def test_confusion_rejects_chance_coder(self):
        with self.assertRaises(ValueError):
            E.confusion_correction([1, 0] * 10, [1, 0, 1, 0], [0, 1, 1, 0])


if __name__ == "__main__":
    unittest.main()
