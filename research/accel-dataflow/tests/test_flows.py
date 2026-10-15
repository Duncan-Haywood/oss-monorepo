import os, random, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_dataflow import flows as F


class T(unittest.TestCase):
    def test_closed_form_matches_simulator(self):
        rng = random.Random(1)
        n = 0
        for _ in range(300):
            O, I, B, P = rng.randint(1, 20), rng.randint(2, 25), rng.randint(1, 4), rng.choice([1, 2, 3, 4, 8, 16])
            if O * B < 2:
                continue
            for df in F.DATAFLOWS:
                c, _ = F.simulate(df, O, I, B, P)
                f = F.closed_form(df, O, I, B, P)
                for k, v in f.items():
                    self.assertEqual(c[k], v, (df, O, I, B, P, k))
                n += 1
        self.assertGreater(n, 800)

    def test_arithmetic_equals_numpy(self):
        rng = np.random.default_rng(0)
        for df in F.DATAFLOWS:
            for O, I, B, P in [(11, 70, 3, 4), (8, 13, 2, 16), (5, 9, 1, 1)]:
                W = rng.integers(-8, 8, (O, I)); X = rng.integers(-128, 128, (B, I))
                _, y = F.simulate(df, O, I, B, P, W, X)
                ref = X @ W.T
                for b in range(B):
                    for o in range(O):
                        self.assertEqual(y[(b, o)], ref[b, o])

    def test_each_mac_done_once(self):
        for df in F.DATAFLOWS:
            seen = [op[1:] for ops in F.schedule(df, 7, 9, 2, 4) for op in ops]
            self.assertEqual(len(seen), 7 * 9 * 2)
            self.assertEqual(len(set(seen)), 7 * 9 * 2)

    def test_p1_cycles_are_macs(self):
        for df in F.DATAFLOWS:
            self.assertEqual(F.closed_form(df, 8, 70, 1, 1)["cycles"], 8 * 70)


if __name__ == "__main__":
    unittest.main()
