"""Milestone 5c: certificates and the fabric-transferred bound on milestone 4e's tiers."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m5c", HERE.parent / "experiments" / "m5c_tier_bounds" / "run.py")
m5c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m5c)


class TestM5c(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.S, cls.X = m5c.scores(), m5c.scores(extended=True)
        cls.Q = m5c.analyse(cls.S)

    def test_instances(self):
        fams = [q["fam"] for q in self.Q]
        self.assertEqual(len(self.Q), 45)
        self.assertEqual(fams.count("T1->T3"), 18)
        self.assertEqual(fams.count("T3u->T3c"), 9)
        for q in self.Q:
            self.assertEqual(sorted(q["t"]), list(m5c.OFFSETS))

    def test_extended_swaps_exactly_the_nine_capped_cases(self):
        changed = [(k, o) for k in self.S for o in self.S[k] if self.S[k][o] != self.X[k][o]]
        self.assertEqual(len(changed), 9)
        self.assertTrue(all(k[2] == "t3" for k, _ in changed))

    def test_theorems_and_coverage(self):
        c = m5c.counts(self.Q)
        self.assertTrue(c["theorems"])
        self.assertEqual(c["rk3_cov"], 45)
        self.assertEqual(c["rloo_cov"], 36)

    def test_k_loo_is_max_of_the_other_fabrics(self):
        G = [q for q in self.Q if q["fam"] == "T2->T3" and q["lab"].endswith("_c")]
        for q in G:
            self.assertAlmostEqual(q["K_loo"], max(x["Kstar"] for x in G if x is not q))

    def test_only_regret_is_the_sheet_on_f2_calibrated(self):
        pos = m5c.counts(self.Q)["regret_pos"]
        self.assertEqual([(a, b) for a, b, _ in pos], [("T2->T3", "F2_c")])
        q = next(q for q in self.Q if q["fam"] == "T2->T3" and q["lab"] == "F2_c")
        self.assertAlmostEqual(q["R_K3"], q["regret"], places=12)  # the bound is tight here


if __name__ == "__main__":
    unittest.main()
