import math, random, statistics, unittest
from sleeping_incentives import *


class T(unittest.TestCase):
    def test_budget_balance_with_tax(self):
        rng = random.Random(1)
        for _ in range(100):
            N = rng.randint(2, 6)
            w = [rng.random() + .05 for _ in range(N)]; s = sum(w); w = [x / s for x in w]
            A = [i for i in range(N) if rng.random() < .6] or [0]
            l = [rng.random() for _ in range(N)]
            w2 = step(w, A, l, rng.choice([.1, .3, .5]), tax=rng.choice([0, .05, .2]))
            self.assertAlmostEqual(sum(w2), 1.0, places=12)
            self.assertTrue(all(x > 0 for x in w2))

    def test_loo_identity_exact(self):
        rng = random.Random(2)
        for _ in range(300):
            N = rng.randint(2, 6)
            w = [rng.random() + .05 for _ in range(N)]
            A = sorted(rng.sample(range(N), rng.randint(2, N)))
            l = [rng.random() for _ in range(N)]
            eta = rng.choice([.1, .3, .5])
            w2 = step(w, A, l, eta)
            for i in A:
                S, p, lh, WA = loo_saving(w, A, l, i)
                self.assertAlmostEqual(w2[i] - w[i], eta * WA * (1 - p) * S, places=12)
                # S is the loss of the others minus the loss with i present
                rest = [j for j in A if j != i]
                lo = sum(w[j] * l[j] for j in rest) / sum(w[j] for j in rest)
                self.assertAlmostEqual(S, lo - lh, places=12)

    def test_kappa_matches_quadrature_and_peak(self):
        for th in [.1, .3, .5, .8]:
            q = sum((0.5 - (k + .5) / 4000) for k in range(int(th * 4000))) / 4000
            self.assertAlmostEqual(kappa(th), q, places=3)
        self.assertAlmostEqual(kappa(.5), 1 / 8)
        self.assertGreater(kappa(.5), max(kappa(x / 100) for x in range(101) if x != 50) - 1e-12)
        self.assertEqual(kappa(1.0), 0.0)

    def test_expost_logit_growth(self):
        eta, th = .25, .5
        rounds = []
        for seed in range(60):
            sh, _ = sim_expost(.1, eta, th, 1500, random.Random(seed))
            rounds.append(next(t for t, s in enumerate(sh) if s > .9))
        pred = mean_field_rounds(.1, .9, eta, kappa(th))
        self.assertLess(abs(statistics.median(rounds) / pred - 1), .2)

    def test_expost_router_loss_unchanged(self):
        rng = random.Random(3)
        _, rl = sim_expost(.5, .25, .5, 20000, rng)
        self.assertAlmostEqual(sum(rl) / len(rl), .5, delta=.01)
        _, rl2 = sim_expost(.5, .25, 1.0, 20000, random.Random(3))
        self.assertAlmostEqual(sum(rl2) / len(rl2), .5, delta=.01)

    def test_exante_saving_equals_g(self):
        s0, eta = .3, 1e-7
        # tiny eta keeps the share fixed near s0, so the realised saving is s0 * g
        sh, rl = sim_exante(s0, eta, .5, 0.0, 60000, random.Random(4))
        self.assertAlmostEqual(.5 - sum(rl) / len(rl), s0 * g_signal(.5, 0.0), delta=.004)

    def test_g_foresight_and_monotone_in_noise(self):
        self.assertAlmostEqual(best_theta(0.0)[1], 1 / 8, places=3)
        self.assertAlmostEqual(g_signal(.5, 0.0), 1 / 8, places=3)
        gs = [best_theta(nu)[1] for nu in [0.0, .1, .3, 1.0, 3.0]]
        self.assertTrue(all(a > b for a, b in zip(gs, gs[1:])))
        self.assertLess(gs[-1], .02)

    def test_tax_threshold(self):
        eta = .25
        for pB in [.2, .5, 1.0]:
            tstar = tax_deterrence_threshold(eta, pB)
            self.assertLess(tax_best_theta(eta, pB, .95 * tstar)[0], .999)
            self.assertEqual(tax_best_theta(eta, pB, 1.01 * tstar)[0], 1.0)
        th, v = tax_best_theta(eta, 1.0, 0.0)
        self.assertAlmostEqual(th, .5, places=3); self.assertAlmostEqual(v, eta / 8, places=6)

    def test_tax_halflife(self):
        self.assertAlmostEqual(honest_decay_halflife(.125, .9), math.log(2) / (-.9 * math.log(.875)))
        self.assertLess(honest_decay_halflife(.125, .9), 6.0)


if __name__ == "__main__":
    unittest.main()
