import math, random, unittest
from topk_routing import *


class T(unittest.TestCase):
    def test_projection_feasible_and_kkt(self):
        r = random.Random(0)
        for _ in range(200):
            n = r.randint(2, 12); k = r.randint(1, n - 1)
            w = [math.exp(r.gauss(0, 2)) for _ in range(n)]
            p, lam, m = cap_project(w, k)
            self.assertAlmostEqual(sum(p), k, places=9)
            self.assertTrue(all(0 < x <= 1 + 1e-12 for x in p))
            self.assertEqual(sum(x >= 1 - 1e-12 for x in p) >= m, True)
            for x, y in zip(p, w):
                self.assertAlmostEqual(x, min(1.0, lam * y), places=9)

    def test_projection_is_kl_minimiser(self):
        r = random.Random(1)
        w = [math.exp(r.gauss(0, 2)) for _ in range(8)]
        p, _, _ = cap_project(w, 3)
        base = gen_kl(p, w)
        for _ in range(300):
            q = [r.random() for _ in range(8)]
            # rescale into the feasible set by mixing with p
            s = sum(q); q = [3 * x / s for x in q]
            q = [min(1.0, x) for x in q]
            d = 3 - sum(q)
            if d > 1e-9:
                room = [1 - x for x in q]; q = [x + d * ro / sum(room) for x, ro in zip(q, room)]
            self.assertGreaterEqual(gen_kl(q, w), base - 1e-9)

    def test_k_equals_n_and_one(self):
        self.assertEqual(cap_project([1.0, 2.0], 2)[0], [1.0, 1.0])
        p, _, m = cap_project([1.0, 3.0], 1)
        self.assertAlmostEqual(p[1], .75); self.assertEqual(m, 0)

    def test_systematic_sampling_marginals_and_size(self):
        r = random.Random(2)
        p, _, _ = cap_project([1, 2, 3, 4, 9, 0.5], 3)
        cnt = [0] * 6; N = 60000
        for _ in range(N):
            s = systematic_sample(p, r)
            self.assertEqual(len(s), 3); self.assertEqual(len(set(s)), 3)
            for i in s: cnt[i] += 1
        for c, x in zip(cnt, p): self.assertAlmostEqual(c / N, x, delta=0.01)

    def test_regret_within_bound_on_streams(self):
        r = random.Random(3)
        n, k, T = 12, 3, 600
        eta = tuned_eta(n, k, T)
        streams = [bernoulli_stream([.3 + .03 * i for i in range(n)], T, r),
                   leader_chasing_stream(n, k, T, r), switching_stream(n, k, T, 100, r)]
        for s in streams:
            tot, L, _ = hedge_topk(s, k, eta)
            self.assertLessEqual(tot - best_k_loss(L, k), regret_bound(n, k, T, eta))

    def test_no_cap_can_overplay(self):
        s = [[0.0] + [1.0] * 4 for _ in range(50)]
        _, _, plays = hedge_topk(s, 2, 1.0, cap=False)
        self.assertGreater(plays[-1][1], 0)
        _, _, plays = hedge_topk(s, 2, 1.0, cap=True)
        self.assertEqual(plays[-1][1], 1)


if __name__ == "__main__":
    unittest.main()
