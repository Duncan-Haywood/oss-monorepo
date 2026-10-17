import math, random, unittest
from nlos_twin import *


class M(unittest.TestCase):
    def test_gdop_ring_closed_form(self):
        # for n>=3 equally spaced anchors H^T H = (n/2) I, so GDOP = sqrt(2*2/n) = 2/sqrt(n)
        for n in (3, 4, 7, 12):
            self.assertAlmostEqual(gdop(ring(n)), 2 / math.sqrt(n), places=9)

    def test_noiseless_fix_is_exact(self):
        A = ring(5)
        x = (3.0, -4.0)
        r = [math.hypot(x[0] - a, x[1] - b) for a, b in A]
        f = fix(A, r)
        self.assertAlmostEqual(f[0], 3.0, places=8)
        self.assertAlmostEqual(f[1], -4.0, places=8)

    def test_uniform_nlos_bias_cancels_at_centre(self):
        b = ls_bias(ring(8), (0, 0), [2.0] * 8)
        self.assertAlmostEqual(b[0], 0.0, places=9)
        self.assertAlmostEqual(b[1], 0.0, places=9)

    def test_single_blocked_anchor_bias(self):
        # one anchor reading m too long pulls the fix away by 2m/n along its axis (n/2 normalisation)
        n, m = 8, 2.0
        b = ls_bias(ring(n), (0, 0), [m] + [0.0] * (n - 1))
        self.assertAlmostEqual(math.hypot(*b), 2 * m / n, places=9)

    def test_bias_matches_simulation(self):
        A = ring(8)
        rng = random.Random(3)
        es = [fix(A, [math.hypot(a, b) + rng.gauss(0, 0.3) + (rng.expovariate(0.5) if i < 2 else 0) for i, (a, b) in enumerate(A)])
              for _ in range(6000)]
        bx = sum(e[0] for e in es) / len(es)
        self.assertAlmostEqual(bx, ls_bias(A, (0, 0), [2.0, 2.0] + [0.0] * 6)[0], delta=0.04)

    def test_variance_law(self):
        A = ring(6)
        rng = random.Random(4)
        p, m, s = 0.2, 3.0, 0.3
        es = [fix(A, simulate(A, (0, 0), p, m, s, rng)) for _ in range(8000)]
        rms = math.sqrt(sum(a * a + b * b for a, b in es) / len(es))
        law = gdop(A) * math.sqrt(s * s + p * (2 - p) * m * m)
        self.assertAlmostEqual(rms, law, delta=0.05 * law)

    def test_trimming_helps_under_nlos_and_costs_without(self):
        A = ring(8)
        def rms(p, drop):
            rng = random.Random(5)
            es = [trimmed_fix(A, simulate(A, (0, 0), p, 3.0, 0.3, rng), drop) for _ in range(3000)]
            return math.sqrt(sum(a * a + b * b for a, b in es) / len(es))
        self.assertLess(rms(0.2, 1), rms(0.2, 0))
        self.assertGreater(rms(0.0, 1), rms(0.0, 0))

    def test_anchors_needed_monotone(self):
        self.assertLessEqual(anchors_needed(1.0, 0.3), anchors_needed(0.2, 0.3))


if __name__ == "__main__":
    unittest.main()
