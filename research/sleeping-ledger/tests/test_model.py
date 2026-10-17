import math, random, unittest
from sleeping_ledger import *


def rand_instance(rng):
    N = rng.randint(2, 5); T = rng.randint(10, 120)
    pi = [rng.random() + .05 for _ in range(N)]; s = sum(pi); pi = [x / s for x in pi]
    q = rng.random(); awake, losses = [], []
    for _ in range(T):
        A = [i for i in range(N) if rng.random() < q] or [rng.randrange(N)]
        awake.append(A); losses.append({i: rng.random() for i in A})
    return N, pi, awake, losses


class T(unittest.TestCase):
    def test_budget_balance_exact(self):
        rng = random.Random(0)
        for _ in range(50):
            N, pi, awake, losses = rand_instance(rng)
            o = run_ledger(pi, awake, losses, rng.choice([.1, .3, .5]))
            for h in o["hist"]:
                self.assertAlmostEqual(sum(h), 1.0, places=12)

    def test_sleepers_are_frozen(self):
        pi = [.25] * 4
        awake = [[0, 1], [2, 3], [2, 3]]
        losses = [{0: 0.1, 1: 0.9}, {2: 0.2, 3: 0.7}, {2: 0.1, 3: 0.9}]
        o = run_ledger(pi, awake, losses, 0.4)
        self.assertEqual(o["hist"][0][2], .25); self.assertEqual(o["hist"][0][3], .25)
        self.assertEqual(o["hist"][1][0], o["hist"][0][0]); self.assertEqual(o["hist"][2][1], o["hist"][0][1])
        self.assertAlmostEqual(o["hist"][2][0] + o["hist"][2][1], .5, places=14)

    def test_lone_module_is_untouched(self):
        o = run_ledger([.5, .5], [[0]] * 5, [{0: 0.3}] * 5, 0.5)
        self.assertEqual(o["w"], [.5, .5]); self.assertEqual(o["lhat"], [0.3] * 5)

    def test_regret_bound_linear_holds(self):
        rng = random.Random(1)
        for _ in range(200):
            N, pi, awake, losses = rand_instance(rng)
            eta = rng.choice([.05, .2, .5]); o = run_ledger(pi, awake, losses, eta)
            for i in range(N):
                r, n, s2 = per_module_regret(o, awake, losses, i)
                if n:
                    self.assertLessEqual(r, math.log(1 / pi[i]) / eta + eta * s2 + 1e-9)
                    self.assertLessEqual(r, regret_bound_linear(pi[i], n, eta) + 1e-9)

    def test_regret_bound_exp_holds_and_wealth_grows(self):
        rng = random.Random(2)
        for _ in range(100):
            N, pi, awake, losses = rand_instance(rng)
            eta = rng.choice([.1, .5, 1.0]); o = run_ledger(pi, awake, losses, eta, "exp")
            self.assertGreaterEqual(sum(o["w"]), 1 - 1e-12)
            for i in range(N):
                r, n, _ = per_module_regret(o, awake, losses, i)
                if n:
                    self.assertLessEqual(r, regret_bound_exp(pi[i], len(awake), eta) + 1e-9)

    def test_admission_bounds(self):
        rng = random.Random(3)
        N = 3; pi = [1 / 3] * 3; eta, eps = .25, .05
        a1 = [[0, 1, 2]] * 60; l1 = [{i: rng.random() for i in range(3)} for _ in range(60)]
        o1 = run_ledger(pi, a1, l1, eta)
        w = admit(o1["w"], eps)
        self.assertAlmostEqual(sum(w), 1.0, places=14)
        a2 = [[0, 1, 2, 3]] * 60; l2 = [{i: rng.random() for i in range(4)} for _ in range(60)]
        o2 = run_ledger(w, a2, l2, eta)
        for i in range(3):
            r1, n1, _ = per_module_regret(o1, a1, l1, i); r2, n2, _ = per_module_regret(o2, a2, l2, i)
            self.assertLessEqual(r1 + r2, math.log(1 / (pi[i] * (1 - eps))) / eta + eta * (n1 + n2) + 1e-9)
        r, n, _ = per_module_regret(o2, a2, l2, 3)
        self.assertLessEqual(r, regret_bound_linear(eps, n, eta) + 1e-9)

    def test_ledger_beats_forced_reporting_on_regimes(self):
        K = 4
        awake, losses, reg = regime_instance(K, 20, 25, seed=1)
        o = run_ledger([1 / (K + 1)] * (K + 1), awake, losses, 0.3)
        h = forced_hedge(K + 1, full_losses_for_forced(awake, losses, K, 0.6), 0.3, filler=0.6, awake=awake)
        T_ = len(awake)
        self.assertLess(sum(o["lhat"]) / T_, 0.11)
        self.assertGreater(sum(h) / T_, 0.25)
        self.assertLess(sum(o["lhat"]) - oracle_loss(awake, losses, range(K)), 10)

    def test_generalist_alone_matches_hedge_bound(self):
        # all awake always: ledger reduces to the ordinary multiplicative wagering market; regret <= ln N/eta + eta T
        rng = random.Random(4)
        N, T_ = 5, 200
        awake = [list(range(N))] * T_; losses = [{i: rng.random() * (1 if i else .6) for i in range(N)} for _ in range(T_)]
        o = run_ledger([1 / N] * N, awake, losses, 0.3)
        for i in range(N):
            r, n, _ = per_module_regret(o, awake, losses, i)
            self.assertLessEqual(r, regret_bound_linear(1 / N, T_, 0.3))


if __name__ == "__main__":
    unittest.main()
