import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "simdesign-starts", "src"))
from simdesign_startsconverge import run_checkpoints, pairwise_disagreement
from simdesign_starts import run_from, random_start


class T(unittest.TestCase):
    def test_snapshots_match_independent_runs(self):
        x0 = random_start(24, 8, 0.5, 0.3, 4)
        r = run_checkpoints(x0, 24, 8, [5, 12])
        for n in (5, 12):
            ref = run_from(x0, 24, 8, iters=n)
            self.assertTrue(np.allclose(r[n]["x"], ref["x"]))
            self.assertAlmostEqual(r[n]["compliance"], ref["compliance"], places=8)

    def test_volume_held_and_change_reported(self):
        r = run_checkpoints(np.full((8, 24), 0.5), 24, 8, [10, 30])
        for n in (10, 30):
            self.assertAlmostEqual(r[n]["x"].mean(), 0.5, delta=0.005)
        self.assertLess(r[30]["change"], r[10]["change"] + 1e-12 + 0.2)
        self.assertGreater(r[10]["change"], 0)

    def test_pairwise_disagreement_exact(self):
        a = np.array([[1.0, 0.0], [1.0, 0.0]]); b = np.array([[1.0, 1.0], [1.0, 0.0]]); c = a.copy()
        # pairs: (a,b)=0.25, (a,c)=0, (b,c)=0.25 -> median 0.25
        self.assertEqual(pairwise_disagreement([a, b, c]), 0.25)
        self.assertEqual(pairwise_disagreement([a, c]), 0.0)

    def test_deterministic(self):
        x0 = random_start(16, 6, 0.5, 0.45, 9)
        a = run_checkpoints(x0, 16, 6, [8])[8]; b = run_checkpoints(x0, 16, 6, [8])[8]
        self.assertTrue(np.array_equal(a["x"], b["x"]))

if __name__ == "__main__":
    unittest.main()
