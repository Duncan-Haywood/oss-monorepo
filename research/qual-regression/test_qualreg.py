import random
import unittest

import qualreg as r


class T(unittest.TestCase):
    def test_solve(self):
        x = r.solve([[2.0, 1.0], [1.0, 3.0]], [3.0, 5.0])
        self.assertAlmostEqual(x[0], 0.8)
        self.assertAlmostEqual(x[1], 1.4)

    def test_ols_exact_line(self):
        xs = [[1.0, float(i)] for i in range(10)]
        th, se = r.ols(xs, [2 + 3 * i for i in range(10)])
        self.assertAlmostEqual(th[0], 2)
        self.assertAlmostEqual(th[1], 3)
        self.assertLess(se[1], 1e-9)

    def test_dsl_equals_ols_with_perfect_coder(self):
        rng = random.Random(1)
        ys, lr, gold, gt, tr = r.simulate(400, 0.3, 1.0, 1.0, (1, 2, 0.5), 1.0, 0.2, rng)
        th, _ = r.dsl(lr, ys, gold, gt, 0.2)
        th2, _ = r.ols(tr, ys)
        for a, b in zip(th, th2):
            self.assertAlmostEqual(a, b, places=8)

    def test_dsl_unbiased_naive_attenuated(self):
        rng = random.Random(7)
        nv, ds = [], []
        for _ in range(60):
            ys, lr, gold, gt, _ = r.simulate(2000, 0.3, 0.7, 0.95, (0, 2.0, 0.5), 1.0, 0.1, rng)
            nv.append(r.ols(lr, ys)[0][1])
            ds.append(r.dsl(lr, ys, gold, gt, 0.1)[0][1])
        self.assertLess(r.mean(nv), 1.8)
        self.assertAlmostEqual(r.mean(ds), 2.0, delta=0.1)

    def test_class_shares_ppi_corrects(self):
        rng = random.Random(3)
        conf = [[0.8, 0.15, 0.05], [0.1, 0.8, 0.1], [0.3, 0.1, 0.6]]
        truth, llm = r.simulate_classes(20000, [0.3, 0.4, 0.3], conf, rng)
        idx = rng.sample(range(20000), 1000)
        est = r.class_shares_ppi(llm, [llm[i] for i in idx], [truth[i] for i in idx], 3)
        self.assertAlmostEqual(est[2][0], 0.3, delta=0.04)
        self.assertGreater(abs(r.class_shares_naive(llm, 3)[2][0] - 0.3), 0.04)


if __name__ == "__main__":
    unittest.main()
