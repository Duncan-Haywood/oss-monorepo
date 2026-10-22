import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pendmiss as P


class T(unittest.TestCase):
    def test_disc_matches_series(self):
        w2, h = 4.0, 0.01
        a, b = P.disc(w2, h)
        # first-order: Ad ~ I + A h, Bd ~ [h^2/2, h]
        self.assertAlmostEqual(a[0][1], h, places=5)
        self.assertAlmostEqual(a[1][0], w2 * h, places=4)
        self.assertAlmostEqual(b[0], h * h / 2, places=6)

    def test_semigroup(self):
        # two steps of h with zero input equal one step of 2h
        a1, _ = P.disc(9.0, 0.1)
        a2, _ = P.disc(9.0, 0.2)
        m = P.matmul(a1, a1)
        for i in range(2):
            for j in range(2):
                self.assertAlmostEqual(m[i][j], a2[i][j], places=12)

    def test_gain_places_poles(self):
        for pole in (0.8, 0.0, -0.3):
            g = P.closed(19.6, 0.05, P.gain(19.6, 0.05, pole))
            tr, det = g[0][0] + g[1][1], g[0][0] * g[1][1] - g[0][1] * g[1][0]
            self.assertAlmostEqual(tr, 2 * pole, places=9)
            self.assertAlmostEqual(det, pole * pole, places=9)

    def test_ms_rate_deterministic(self):
        g = [[0.5, 0.0], [0.0, 0.3]]
        self.assertAlmostEqual(P.ms_rate([g], [1.0]), 0.25, places=6)

    def test_ms_rate_matches_monte_carlo(self):
        g1, g2 = [[0.9, 0.2], [0.0, 0.5]], [[1.1, 0.0], [0.3, 0.6]]
        r = P.ms_rate([g1, g2], [0.7, 0.3])
        rng, acc, n = random.Random(1), 0.0, 20000
        for _ in range(n):
            x = [1.0, 0.0]
            for _ in range(8):
                x = P.matvec(g1 if rng.random() < 0.7 else g2, x)
            acc += x[0] ** 2 + x[1] ** 2
        mc = (acc / n) ** (1 / 8)  # per-step moment growth, transient included
        self.assertLess(abs(r - mc) / r, 0.25)

    def test_ms_rate_nilpotent_is_zero(self):
        a = [[0.0, 1.0], [0.0, 0.0]]
        self.assertLess(P.ms_rate([a], [1.0]), 1e-6)

    def test_threshold(self):
        self.assertAlmostEqual(P.threshold(lambda x: x < 0.3, 0, 1), 0.3, places=9)


if __name__ == "__main__":
    unittest.main()
