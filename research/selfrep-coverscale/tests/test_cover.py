import itertools, pathlib, random, sys, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_coverscale import cover as c


def brute(w, cov, pen, budget):
    best = 0.0
    for r in range(len(cov) + 1):
        for s in itertools.combinations(range(len(cov)), r):
            if sum(pen[i] for i in s) <= budget + 1e-12:
                m = 0
                for i in s:
                    m |= cov[i]
                best = max(best, c.value(m, w))
    return best


class T(unittest.TestCase):
    def test_exact_matches_brute_force(self):
        rng = random.Random(3)
        for _ in range(25):
            w, cov, pen = c.random_instance(rng, 9, 8, 0.6)
            for b in (0.5, 1.5, 3.0):
                self.assertAlmostEqual(c.exact(w, cov, pen, b), brute(w, cov, pen, b), places=9)

    def test_heuristics_never_beat_exact(self):
        rng = random.Random(4)
        for _ in range(20):
            w, cov, pen = c.random_instance(rng, 10, 9, 0.5)
            e = c.exact(w, cov, pen, 2.0)
            for v in (c.greedy(w, cov, pen, 2.0), c.greedy_plus_single(w, cov, pen, 2.0),
                      c.random_search(rng, w, cov, pen, 2.0, 20), c.local_search(rng, w, cov, pen, 2.0)):
                self.assertLessEqual(v, e + 1e-9)

    def test_zero_budget_covers_nothing(self):
        w, cov, pen = c.random_instance(random.Random(1), 6, 6, 0.5)
        self.assertEqual(c.exact(w, cov, pen, 0), 0.0)
        self.assertEqual(c.greedy(w, cov, pen, 0), 0.0)

    def test_overlap_makes_gains_non_additive(self):
        w = [1.0, 2.0]
        self.assertEqual(c.value(0b11, w), 3.0)
        self.assertLess(c.value(0b01 | 0b01, w), c.value(0b01, w) + c.value(0b01, w))

    def test_greedy_can_be_suboptimal(self):
        # classic trap: a cheap high-ratio item blocks a big one
        w = [4.0, 7.0]; cov = [0b01, 0b10]; pen = [0.5, 1.0]
        self.assertAlmostEqual(c.greedy(w, cov, pen, 1.0), 4.0)
        self.assertAlmostEqual(c.exact(w, cov, pen, 1.0), 7.0)
        self.assertAlmostEqual(c.greedy_plus_single(w, cov, pen, 1.0), 7.0)


if __name__ == "__main__":
    unittest.main()
