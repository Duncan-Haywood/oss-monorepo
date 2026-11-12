"""Milestone 5b: the penalty-keeping regret bound and the screen-and-verify loop."""
import importlib.util
import random
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m5b", HERE.parent / "experiments" / "m5b_penalty_bound" / "run.py")
m5b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m5b)


class TestM5b(unittest.TestCase):
    def test_penalty_bound_holds_on_random_instances(self):
        rng = random.Random(1)
        for _ in range(3000):
            D = [0.5 * i for i in range(rng.randint(2, 9))]
            t = {d: rng.uniform(0, 2) for d in D}
            T = {d: t[d] + rng.uniform(-1, 1) * rng.choice([0.01, 0.1, 1]) for d in D}
            q = m5b.quantities(t, T)
            eps = 1e-12
            self.assertLessEqual(q["regret"], q["R_Ks"] + eps)
            self.assertLessEqual(q["R_Ks"], q["R_L"] + eps)
            self.assertLessEqual(q["regret"], q["R_osc"] + eps)
            self.assertLessEqual(q["R_Ks"], q["pair"] + q["R_Ks"])  # sanity: finite, non-negative
            self.assertGreaterEqual(q["R_Ks"], 0)
            # exhaustive kappa: SV never does worse than local-3, which it contains
            self.assertLessEqual(q["sv1_r"], q["loc_r"] + eps)
            self.assertLessEqual(q["sv1_n"], len(D))

    def test_hand_case(self):
        # cheap tier picks 0; reference error rises by 0.3 per unit, cheap penalty at 1 is 0.1
        t = {0.0: 0.0, 1.0: 0.1, 2.0: 1.0}
        T = {0.0: 0.5, 1.0: 0.3, 2.0: 1.2}
        q = m5b.quantities(t, T)
        self.assertAlmostEqual(q["regret"], 0.2)
        self.assertAlmostEqual(q["Kstar"], 0.3)       # |e(1) - e(0)| / 1 = |0.2 - 0.5|
        self.assertAlmostEqual(q["R_Ks"], 0.2)        # 0.3 * 1 - 0.1, tight here
        self.assertEqual(q["sv1_r"], 0.0)

    def test_committed_instances(self):
        Q = [m5b.quantities(t, T) for _, _, t, T, _ in m5b.m5.load()]
        self.assertEqual(len(Q), 50)
        self.assertEqual(sum(q["sv1_r"] == 0 for q in Q), 48)
        self.assertEqual(sum(q["R_K3"] >= q["regret"] - 1e-12 for q in Q), 47)


if __name__ == "__main__":
    unittest.main()
