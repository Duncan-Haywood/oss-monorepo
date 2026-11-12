"""Milestone 5: the decision-margin bound and its certificates, on random instances and on the
committed shape errors of milestones 1b to 1d."""
import importlib.util
import random
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m5", HERE.parent / "experiments" / "m5_margin_bound" / "run.py")
m5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m5)


class TestM5(unittest.TestCase):
    def test_bound_and_certificates_on_random_instances(self):
        rng = random.Random(0)
        for _ in range(3000):
            D = [0.5 * i for i in range(rng.randint(2, 9))]
            t = {d: rng.uniform(0, 2) for d in D}
            T = {d: t[d] + rng.uniform(-1, 1) * rng.choice([0.01, 0.1, 1]) for d in D}
            q = m5.regret_quantities(t, T)
            eps = 1e-12
            self.assertGreaterEqual(q["regret"], -eps)
            self.assertLessEqual(q["regret"], q["pair"] + eps)
            self.assertLessEqual(q["pair"], q["osc"] + eps)
            self.assertLessEqual(q["osc"], q["absb"] + eps)
            self.assertLessEqual(q["regret"], q["cone"] + eps)
            if q["c1"] or q["c2"]:
                self.assertEqual(q["choice"], q["best"])
            # the reference optimum always lies in both screening sets
            self.assertLessEqual(t[q["best"]] - t[q["choice"]], q["osc"] + eps)
            self.assertLessEqual(t[q["best"]] - t[q["choice"]], q["L"] * abs(q["best"] - q["choice"]) + eps)

    def test_constant_error_certifies(self):
        t = {0.0: 1.0, 0.5: 0.4, 1.0: 0.7}
        q = m5.regret_quantities(t, {d: v + 1.7 for d, v in t.items()})
        self.assertEqual(q["regret"], 0)
        self.assertAlmostEqual(q["osc"], 0, places=12)
        self.assertTrue(q["c1"] and q["c2"])
        self.assertAlmostEqual(q["absb"], 3.4)

    def test_instances_from_committed_results(self):
        inst = m5.load()
        fams = [i[0] for i in inst]
        self.assertEqual(len(inst), 50)
        self.assertEqual((fams.count("2d->3d"), fams.count("cap->conv"), fams.count("mesh"), fams.count("param")),
                         (28, 4, 4, 14))
        lab = {i[1]: i for i in inst}
        # EA_kes is read from 1d's table: fabric A's (2360) is below the 3200 sweep value
        self.assertIn("1d A EA3200->EA_kes 2360", lab)
        _, _, t, T, _ = lab["1b D"]
        self.assertEqual((t[1.0], T[1.0]), (2.0513, 2.1987))   # 1b's capped and converged scores
        q = m5.regret_quantities(t, T)
        self.assertEqual((q["choice"], q["best"]), (1.0, 1.5))


if __name__ == "__main__":
    unittest.main()
