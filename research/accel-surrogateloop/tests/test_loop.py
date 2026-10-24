import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
from accel_surrogateloop import fe2d, loop


class Loop(unittest.TestCase):
    def setUp(self):
        loop.MESH = (16, 2)                      # cheap mesh for tests
        self.limit = fe2d.tip_deflection(np.full(fe2d.NSEG, 0.04), *loop.MESH)

    def test_trace_is_monotone_and_feasible(self):
        rng = np.random.default_rng(0)
        tr, H, d = loop.random_search(rng, self.limit, 40)
        got = [t for t in tr if t is not None]
        self.assertTrue(all(a >= b for a, b in zip(got, got[1:])))
        self.assertAlmostEqual(got[-1], min(h.sum() for h, x in zip(H, d) if x <= self.limit))
        self.assertEqual(len(tr), 40)

    def test_budget_is_respected(self):
        rng = np.random.default_rng(1)
        self.assertEqual(len(loop.es(rng, self.limit, 50)[0]), 50)
        tr, H, d, st = loop.assisted(rng, self.limit, 50)
        self.assertEqual(len(tr), 50)
        self.assertEqual(len(H), 50)

    def test_es_beats_nothing_and_stays_in_bounds(self):
        rng = np.random.default_rng(2)
        tr, H, d = loop.es(rng, self.limit, 60)
        self.assertTrue((H >= fe2d.H_LO - 1e-12).all() and (H <= fe2d.H_HI + 1e-12).all())
        self.assertIsNotNone(tr[-1])

    def test_assisted_finds_feasible_design_lighter_than_uniform(self):
        rng = np.random.default_rng(3)
        tr, H, d, st = loop.assisted(rng, self.limit, 80)
        self.assertIsNotNone(tr[-1])
        self.assertLessEqual(tr[-1], 0.04 * fe2d.NSEG * 1.05)


if __name__ == '__main__':
    unittest.main()
