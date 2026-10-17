import math
import unittest
from verification_game import (Params, equilibrium, multi_verifier, jackpot_budget,
                              fictitious_play, DriftModel, best_design)


class T(unittest.TestCase):
    def setUp(self):
        self.p = Params(s=1.0, S=4.0, k=0.5, lam=0.5, h=0.0)

    def test_indifference(self):
        p = self.p
        x, y = equilibrium(p)
        self.assertAlmostEqual(x, 0.25)
        self.assertAlmostEqual(y, 0.2)
        self.assertAlmostEqual((1 - y) * p.s - y * p.S, 0)          # solver
        self.assertAlmostEqual(x * (p.lam * p.S + p.h) - p.k, 0)     # verifier

    def test_verifiers_dilemma(self):
        x, y = equilibrium(Params(s=1, S=0.5, k=0.5, lam=0.5))
        self.assertEqual((x, y), (1.0, 0.0))  # reward too small: nobody checks

    def test_more_stake_less_cheating_and_auditing(self):
        prev = None
        for S in (2, 4, 8, 16):
            x, y = equilibrium(Params(1, S, 0.5))
            if prev:
                self.assertLess(x, prev[0]); self.assertLess(y, prev[1])
            prev = (x, y)

    def test_fictitious_play_matches(self):
        x, y = equilibrium(self.p)
        fx, fy = fictitious_play(self.p, rounds=100000)
        self.assertAlmostEqual(fx, x, delta=0.03)
        self.assertAlmostEqual(fy, y, delta=0.03)

    def test_multi_verifier(self):
        x1, y1, c1 = multi_verifier(self.p, 1)
        self.assertAlmostEqual(x1, equilibrium(self.p)[0])
        self.assertAlmostEqual(y1, equilibrium(self.p)[1])
        D = self.p.s / (self.p.s + self.p.S)
        xs = [multi_verifier(self.p, m)[0] for m in (1, 2, 5, 50)]
        self.assertTrue(all(a < b for a, b in zip(xs, xs[1:])))      # free-riding
        # limit: cost -> k ln(1/(1-D)); cheat -> k ln(1/(1-D))/(lam S D)
        xl, _, cl = multi_verifier(self.p, 100000)
        self.assertAlmostEqual(cl, self.p.k * math.log(1 / (1 - D)), places=3)
        self.assertAlmostEqual(xl, cl / (self.p.lam * self.p.S * D), places=3)

    def test_jackpot(self):
        p = self.p
        self.assertAlmostEqual(jackpot_budget(p, 0.0, 0.05), p.k)
        self.assertEqual(jackpot_budget(p, 1.0, 0.0), 0.0)

    def test_drift_design_tradeoff(self):
        m = DriftModel()
        taus = [0.25 * i for i in range(1, 40)]
        Ss = [0.5 * i for i in range(1, 80)]
        d = best_design(m, taus, Ss)
        self.assertIsNotNone(d)
        self.assertLessEqual(d["cheat"], m.eps_max)
        self.assertGreaterEqual(m.margin - d["p_fp"] * d["S"], -1e-9)
        # noisier hardware forces a looser tolerance and costs more
        d2 = best_design(DriftModel(sigma=2.0), taus, Ss)
        self.assertGreater(d2["loss"], d["loss"])
        self.assertGreater(d2["tau"], d["tau"])


if __name__ == "__main__":
    unittest.main()
