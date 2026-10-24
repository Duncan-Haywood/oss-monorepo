import os, sys, unittest
import numpy as np
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "codesign-agri", "src"))
from codesign_agri_sweep import world as W
from codesign_agri import agri as A


class WorldTests(unittest.TestCase):
    def test_nominal_reproduces_codesign_agri_exactly(self):
        ev = W.make_evaluator(W.NOMINAL)
        rng = np.random.default_rng(1)
        for _ in range(25):
            x = np.array(W.LB) + rng.random(5) * (np.array(W.UB) - np.array(W.LB))
            a, b = ev(x), A.evaluate(x)
            for k in ("J", "cost", "good", "bruised", "slipped", "missed", "collided"):
                self.assertAlmostEqual(a[k], b[k], places=12)

    def test_worlds_stay_inside_ranges_and_are_reproducible(self):
        ws = W.draw_worlds(30, seed=3)
        self.assertEqual(ws, W.draw_worlds(30, seed=3))
        for w in ws:
            for k, (_, lo, hi, _) in W.PARAMS.items():
                self.assertTrue(lo - 1e-9 <= w[k] <= hi + 1e-9)

    def test_outcome_shares_partition_in_every_world(self):
        for w in W.draw_worlds(10, seed=1):
            r = W.make_evaluator(w)([20, 25, 0.5, 5, 3])
            self.assertAlmostEqual(r["good"] + r["bruised"] + r["slipped"] + r["missed"], 1.0, places=9)

    def test_tougher_fruit_never_bruises_more(self):
        lo = dict(W.NOMINAL, bruise_scale=0.5); hi = dict(W.NOMINAL, bruise_scale=2.0)
        x = [10, 25, 2.0, 5, 3]
        self.assertGreaterEqual(W.make_evaluator(lo)(x)["bruised"], W.make_evaluator(hi)(x)["bruised"])


if __name__ == "__main__":
    unittest.main()
