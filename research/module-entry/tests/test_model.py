import math, random, unittest
from module_entry import *


class T(unittest.TestCase):
    def test_kraft_identity_any_shares(self):
        rng = random.Random(1)
        for _ in range(200):
            n0, K = rng.randint(1, 6), rng.randint(1, 12)
            sh = [rng.uniform(0.01, 0.99) for _ in range(K)]
            self.assertAlmostEqual(kraft_sum(n0, sh), 1.0, places=12)

    def test_uniform_equalises_and_is_minimax(self):
        rng = random.Random(2)
        for _ in range(100):
            n0, K = rng.randint(1, 6), rng.randint(1, 12)
            c = certificate(n0, uniform_shares(n0, K))
            for x in c:
                self.assertAlmostEqual(x, math.log(n0 + K), places=12)
            for _ in range(20):
                sh = [rng.uniform(0.01, 0.99) for _ in range(K)]
                self.assertGreaterEqual(max(certificate(n0, sh)), math.log(n0 + K) - 1e-12)

    def test_prior_shares_optimal(self):
        rng = random.Random(3)
        n0, K = 3, 8
        for _ in range(50):
            P = [rng.random() for _ in range(K + 1)]
            z = sum(P); P = [x / z for x in P]
            sh = prior_shares(P, n0)
            c = certificate(n0, sh)
            val = P[0] * c[0] + sum(P[j + 1] * c[j + 1] for j in range(K))
            self.assertAlmostEqual(val, entropy(P) + P[0] * math.log(n0), places=10)
            for _ in range(30):     # no random share sequence does better
                alt = [rng.uniform(0.02, 0.98) for _ in range(K)]
                ca = certificate(n0, alt)
                self.assertGreaterEqual(P[0] * ca[0] + sum(P[j + 1] * ca[j + 1] for j in range(K)), val - 1e-10)

    def test_regret_certificate_holds(self):
        rng = random.Random(4)
        eta = 0.3
        for _ in range(30):
            n0, K = rng.randint(2, 4), rng.randint(1, 4)
            sh = [rng.uniform(0.05, 0.9) for _ in range(K)]
            rows, arr = random_run(rng, n0, K, 40, rng.randrange(n0 + K), 0.2)
            learner, _ = run(rows, n0, arr, sh, eta)
            c = certificate(n0, sh)
            T_ = len(rows)
            for i in range(n0 + K):
                start = 0 if i < n0 else arr[i - n0]
                r = regret_from_arrival(learner, rows, i, start)
                ci = c[0] if i < n0 else c[i - n0 + 1]
                self.assertLessEqual(r, ci / eta + eta * (T_ - start) / 8 + 1e-9)

    def test_exact_entry_cost_good_and_bad(self):
        # incumbents constant loss 0.5 (n0=1 so one incumbent), arrival better/worse by delta, long horizon.
        eta = 0.05
        for pi in (0.05, 0.3, 0.5):
            for delta, good in ((0.2, True), (0.2, False), (0.05, True)):
                T_ = int(60 / (eta * delta))   # tail share e^-60-ish: truncation negligible
                rows = [[0.5, 0.5 - delta if good else 0.5 + delta] for _ in range(T_)]
                learner, _ = run(rows, 1, [0], [pi], eta)
                if good:
                    reg = regret_from_arrival(learner, rows, 1, 0)
                else:
                    reg = regret_from_arrival(learner, rows, 0, 0)
                theory = math.log(1 / pi if good else 1 / (1 - pi))
                # discrete sum = integral + (first-round share)*eta*delta/2 (Euler-Maclaurin)
                s0 = (1 - pi) if good else pi
                self.assertAlmostEqual(reg * eta, theory + eta * delta * s0 / 2, delta=5e-4)

    def test_catchup_time(self):
        eta, delta, pi = 0.05, 0.2, 0.05
        rows = [[0.5, 0.5 - delta] for _ in range(2000)]
        _, paths = run(rows, 1, [0], [pi], eta)
        t_half = next(t for t, p in enumerate(paths) if p[1] >= 0.5)
        self.assertLess(abs(t_half - catchup_time(pi, eta, delta)), 1.5)


if __name__ == "__main__":
    unittest.main()
