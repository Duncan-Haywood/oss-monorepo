import math, unittest
from anytime_liquidity import *


class T(unittest.TestCase):
    def test_softmax_sums_to_one(self):
        w = softmax_w([3.0, 1.0, 2.0], 0.7)
        self.assertAlmostEqual(sum(w), 1.0, 12)
        self.assertEqual(max(range(3), key=lambda i: w[i]), 1)

    def test_fixed_b_minimises_bound(self):
        T_, N = 500, 6
        f = lambda b: b * math.log(N) + T_ / (8 * b)
        b = b_fixed(T_, N)
        self.assertAlmostEqual(f(b), bound_fixed_opt(T_, N), 9)
        self.assertLess(f(b), f(1.1 * b)); self.assertLess(f(b), f(0.9 * b))

    def test_c_star_minimises_anytime_bound(self):
        N, T_ = 10, 2000
        g = lambda c: bound([b_sqrt(t, N, c) for t in range(1, T_ + 1)], N)
        c = c_star(N)
        self.assertLess(g(c), g(1.15 * c)); self.assertLess(g(c), g(0.85 * c))

    def test_anytime_ratio_tends_to_sqrt2(self):
        N = 10
        r = bound_anytime_opt(10**5, N) / bound_fixed_opt(10**5, N)
        self.assertAlmostEqual(r, math.sqrt(2), delta=0.005)
        self.assertLess(r, math.sqrt(2))

    def test_regret_below_bound_adversary(self):
        N, T_ = 8, 400
        for bfun in (lambda t: b_fixed(T_, N), lambda t: b_sqrt(t, N)):
            ls = adversary_losses(T_, N, bfun)
            r, _, _ = run(ls, bfun)
            self.assertLessEqual(r, bound([bfun(t) for t in range(1, T_ + 1)], N))

    def test_regret_below_bound_iid(self):
        N, T_ = 5, 1000
        ls = iid_losses(T_, N, 0.1, seed=2)
        r, _, _ = run(ls, lambda t: b_sqrt(t, N))
        self.assertLessEqual(r, bound_anytime_opt(T_, N))

    def test_doubling_within_constant(self):
        N, T_ = 8, 1024
        ls = adversary_losses(T_, N, lambda t: b_sqrt(t, N))
        self.assertLessEqual(run_doubling(ls), sqrt_sum_gap() * bound_fixed_opt(T_, N) * 1.0001)

    def test_adahedge_regret_at_most_twice_delta(self):
        for gap in (0.0, 0.2):
            ls = iid_losses(3000, 6, gap, seed=5)
            r, D, _, _ = run_adahedge(ls)
            self.assertLessEqual(r, 2 * D + 1e-9)

    def test_adahedge_subsidy_small_on_easy_data(self):
        N = 8
        hard = run_adahedge(iid_losses(5000, N, 0.0, seed=1))[2]
        easy = run_adahedge(iid_losses(5000, N, 0.6, seed=1))[2]
        self.assertLess(easy * 10, hard)

    def test_adahedge_subsidy_equals_delta(self):
        _, D, bT, _ = run_adahedge(iid_losses(2000, 4, 0.1, seed=4))
        # final b uses Delta_{T-1}; within one step's gap (<=1) of Delta_T
        self.assertLessEqual(abs(bT * math.log(4) - D), 1.0)


if __name__ == "__main__":
    unittest.main()
