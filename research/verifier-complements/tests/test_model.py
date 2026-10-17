import os, sys, math, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from verifier_complements import *

class T(unittest.TestCase):
    def test_single_value_closed_form(self):
        # pi=.5, c=1, q: risk .5 -> .5(1-q)... value = q - .5 * ... : prior risk .5, posterior risk 1-q
        self.assertAlmostEqual(value([0.8], 0.5, 1.0), 0.5 - 0.2)
    def test_no_value_when_no_flip(self):
        # prior strongly 'accept', one q=.6 verifier cannot flip
        self.assertAlmostEqual(value([0.6], 0.1, 1.0), 0.0)
    def test_min_committee_matches_value(self):
        for q, pi, c in ((0.7, 0.05, 1.0), (0.8, 0.02, 2.0), (0.6, 0.2, 1.0)):
            n0 = min_committee(q, pi, c)
            self.assertAlmostEqual(value([q] * (n0 - 1), pi, c), 0.0, places=12)
            self.assertGreater(value([q] * n0, pi, c), 1e-9)
    def test_mi_submodular_small(self):
        pool = [0.6, 0.7, 0.8, 0.9]
        for pi in (0.05, 0.3, 0.5):
            f = lambda S: mutual_info([pool[k] for k in S], pi)
            for i in range(4):
                for j in range(4):
                    if i != j:
                        rest = [k for k in range(4) if k not in (i, j)]
                        for S in (rest, []):
                            self.assertLessEqual(f(S + [j, i]) - f(S + [j]), f(S + [i]) - f(S) + 1e-12)
    def test_decision_value_violates_submodularity(self):
        bad, tot, _ = submodularity_violations([0.7] * 4, 0.05, 1.0)
        self.assertGreater(bad, 0)
    def test_value_monotone_and_bounded(self):
        vs = [value([0.75] * n, 0.3, 1.0) for n in range(8)]
        self.assertTrue(all(b >= a - 1e-12 for a, b in zip(vs, vs[1:])))
        self.assertLessEqual(vs[-1], prior_risk(0.3, 1.0))
    def test_optimal_beats_greedy_somewhere(self):
        pool = [0.7] * 4 + [0.85]; costs = [1] * 4 + [3.5]
        vg, _ = greedy_committee(pool, costs, 4, 0.05, 1.0); vo, _ = best_committee(pool, costs, 4, 0.05, 1.0)
        self.assertGreaterEqual(vo + 1e-12, vg)
    def test_value_hom_matches(self):
        for n in range(0, 9): self.assertAlmostEqual(value_hom(n, 0.7, 0.05, 1.0), value([0.7] * n, 0.05, 1.0), places=12)
if __name__ == "__main__": unittest.main()
