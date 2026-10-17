import math, random, unittest
from reject_surrogates import *


class T(unittest.TestCase):
    def test_minimiser_decodes_to_bayes(self):
        for d in (0.1, 0.3):
            for i in range(1, 200):
                eta = i / 200
                if abs(eta - d) < 1e-9 or abs(eta - (1 - d)) < 1e-9:
                    continue
                bayes = 1 if eta > 1 - d else (-1 if eta < d else 0)
                self.assertEqual(decode_poly(poly_minimiser(eta, d)), bayes)

    def test_minimiser_beats_fine_grid(self):
        d = 0.2
        for eta in (0.05, 0.3, 0.5, 0.95):
            m = poly_min_risk(eta, d)
            g = min(cond_risk(lambda z: phi_poly(z, d), j / 100.0, eta) for j in range(-400, 401))
            self.assertLessEqual(m, g + 1e-12)
            self.assertAlmostEqual(m, g, places=9)

    def test_linear_transfer_constant_is_2d(self):
        for d in (0.1, 0.3):
            self.assertAlmostEqual(transfer_constant_poly(d, 300), 2 * d, places=9)

    def test_transfer_inequality_everywhere(self):
        d = 0.15
        rng = random.Random(0)
        for _ in range(5000):
            eta, u = rng.random(), rng.uniform(-3, 3)
            self.assertLessEqual(regret_loss_poly(u, eta, d), 2 * d * regret_poly(u, eta, d) + 1e-12)

    def test_logistic_transfer_blows_up_like_1_over_delta(self):
        d = 0.25
        u = math.log(d / (1 - d)) - 1e-9
        r = [regret_loss_log(u, d + dl, d) / regret_log(u, d + dl) * dl for dl in (0.01, 0.001)]
        self.assertAlmostEqual(r[0], 2 * d * (1 - d), delta=0.01)
        self.assertAlmostEqual(r[1], 2 * d * (1 - d), delta=0.002)

    def test_logistic_minimiser_is_logit(self):
        for eta in (0.1, 0.5, 0.8):
            u = log_minimiser(eta)
            self.assertLess(abs(-eta / (1 + math.exp(u)) * 0 + (1 - eta) * sigmoid(u) - eta * (1 - sigmoid(u))), 1e-12)


if __name__ == "__main__":
    unittest.main()
