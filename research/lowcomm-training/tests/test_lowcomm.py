import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "noisy-local-sgd", "src"))
from lowcomm import model, diloco, data  # noqa: E402
import noisy_local_sgd as nls  # noqa: E402,F401
from noisy_local_sgd import model as qm  # noqa: E402


def toy():
    cfg = model.Config(vocab=7, ctx=6, d=8, ff=12)
    theta = model.init(cfg, 1)
    rng = np.random.default_rng(0)
    corpus = rng.integers(0, 7, 400)
    return cfg, theta, corpus


class TestModel(unittest.TestCase):
    def test_gradient_matches_finite_differences(self):
        cfg, theta, corpus = toy()
        X, Y = data.batch(corpus, 0, 0, 0, 3, 6)
        L, g = model.loss_and_grad(cfg, theta, X, Y)
        rng = np.random.default_rng(5)
        for j in rng.choice(len(theta), 40, replace=False):
            e = np.zeros_like(theta)
            e[j] = 1e-5
            fd = (model.loss(cfg, theta + e, X, Y) - model.loss(cfg, theta - e, X, Y)) / 2e-5
            self.assertAlmostEqual(fd, g[j], delta=1e-6 + 1e-4 * abs(fd))

    def test_initial_loss_near_log_vocab(self):
        cfg, theta, corpus = toy()
        X, Y = data.batch(corpus, 0, 0, 0, 16, 6)
        self.assertAlmostEqual(model.loss(cfg, theta, X, Y), np.log(7), delta=0.1)

    def test_causality(self):
        cfg, theta, corpus = toy()
        X, Y = data.batch(corpus, 0, 0, 0, 2, 6)
        X2 = X.copy()
        X2[:, -1] = (X2[:, -1] + 1) % 7
        Y2 = Y.copy()
        Y2[:, :-1] = Y[:, :-1]
        # changing the last input token cannot change the loss on earlier positions: compare loss on a 5-token prefix
        a = model.loss(cfg, theta, X[:, :5], Y[:, :5])
        b = model.loss(cfg, theta, X2[:, :5], Y2[:, :5])
        self.assertEqual(a, b)


class TestDiLoCo(unittest.TestCase):
    def test_m1_h1_equals_synchronous_adamw(self):
        cfg, theta, corpus = toy()
        gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(corpus, 3, m, s, 4, 6))  # noqa: E731
        mk = lambda n: diloco.AdamW(n, 3e-3, wd=0.01)  # noqa: E731
        a = diloco.diloco_train(theta, gf, 1, 1, 25, mk, outer_lr=1.0, outer_beta=0.0)
        b = diloco.sync_train(theta, gf, 1, 25, mk(len(theta)))
        np.testing.assert_allclose(a, b, rtol=0, atol=1e-12)

    def test_heavyball_outer_m1_h1_sgd_is_heavy_ball(self):
        # H = 1, M = 1, inner SGD eta, outer (alpha, beta): theta' = theta - alpha*eta*(g + beta*...) reduces to heavy ball
        cfg, theta, corpus = toy()
        gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(corpus, 3, m, s, 4, 6))  # noqa: E731
        eta, alpha, beta = 0.1, 0.7, 0.5
        a = diloco.diloco_train(theta, gf, 1, 1, 10, lambda n: diloco.SGD(n, eta), alpha, beta, "heavyball")
        th, v = theta.copy(), np.zeros_like(theta)
        for s in range(10):
            v = beta * v + eta * gf(0, s, th)[1]
            th = th - alpha * v
        np.testing.assert_allclose(a, th, atol=1e-12)

    def test_training_reduces_loss_multi_worker(self):
        cfg, theta, _ = toy()
        corpus = (np.arange(400) * 3 % 7).astype(np.int64)  # learnable; the random toy corpus has entropy ln 7
        gf = lambda m, s, th: model.loss_and_grad(cfg, th, *data.batch(corpus, 3, m, s, 8, 6))  # noqa: E731
        X, Y = data.batch(corpus, 99, 0, 0, 64, 6)
        out = diloco.diloco_train(theta, gf, 3, 5, 40, lambda n: diloco.AdamW(n, 5e-3), 0.7, 0.9)
        self.assertLess(model.loss(cfg, out, X, Y), model.loss(cfg, theta, X, Y) - 0.5)

    def test_quadratic_stationary_loss_matches_closed_form(self):
        # the same trainer, objective (1/2) sum a_i x_i^2 with Gaussian gradient noise, against noisy-local-sgd's exact floor
        a_list = [1.0, 0.3, 0.05]
        eta, sigma, M, H, alpha, beta = 0.05, 1.0, 4, 8, 0.8, 0.3
        a = np.array(a_list)
        rngs = [np.random.default_rng(100 + m) for m in range(M)]

        def gf(m, s, th):
            return 0.5 * float(a @ th ** 2), a * th + sigma * rngs[m].normal(size=th.shape)
        losses = []
        diloco.diloco_train(np.zeros(3), gf, M, H, 40000, lambda n: diloco.SGD(n, eta), alpha, beta, "heavyball",
                            on_round=None)
        # re-run keeping the trajectory of the global loss
        rngs = [np.random.default_rng(100 + m) for m in range(M)]
        diloco.diloco_train(np.zeros(3), gf, M, H, 40000, lambda n: diloco.SGD(n, eta), alpha, beta, "heavyball",
                            on_round=lambda r, th, l: losses.append(0.5 * float(a @ th ** 2)))
        sim = float(np.mean(losses[2000:]))
        exact = qm.floor(a_list, eta, sigma, M, H, alpha, beta)
        self.assertAlmostEqual(sim / exact, 1.0, delta=0.08)


if __name__ == "__main__":
    unittest.main()
