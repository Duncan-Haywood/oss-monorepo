import os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
for p in ("../src", "../../chip-accel/src", "../../eda-harness/src"):
    sys.path.insert(0, os.path.join(HERE, p))
from eda_harness import harness as H
from eda_verify import checks, mutate

CAND = {"p": 8, "wb": 4}


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.P = H.Problem(); cls.q = cls.P.quant(CAND); cls.v = cls.P.verilog(CAND)

    def test_golden_passes_random_vectors(self):
        import numpy as np
        xs = np.random.default_rng(1).integers(-8, 8, (12, 8))
        self.assertIsNone(checks.sim_first_mismatch(self.q, 8, self.v, xs))

    def test_sites_are_distinct_and_differ_from_golden(self):
        s = mutate.sites(self.v)
        self.assertGreater(len(s), 100)
        self.assertEqual(len({m["text"] for m in s}), len(s))
        self.assertTrue(all(m["text"] != self.v for m in s))

    def test_a_mutant_is_detected_and_hang_is_bounded(self):
        import numpy as np
        xs = np.random.default_rng(2).integers(-8, 8, (8, 8))
        hang = self.v.replace("st <= IDLE;", "st <= RUN;", 1)       # never finishes: the testbench cap catches it
        self.assertEqual(checks.sim_first_mismatch(self.q, 8, hang, xs), 0)

    def test_directed_vectors_cover_more_than_random(self):
        import numpy as np
        xs, cov = checks.directed_vectors(self.q, 16, seed=0, pool=600)
        rnd = set()
        for x in np.random.default_rng(0).integers(-8, 8, (16, 8)):
            rnd |= checks.coverage_points(self.q, x)
        self.assertGreaterEqual(len(cov), len(rnd))

    def test_formal_kills_a_bug_and_proves_a_copy(self):
        with tempfile.TemporaryDirectory() as d:
            bug = self.v.replace("QMAX = 7", "QMAX = 6", 1)
            self.assertEqual(checks.formal(self.v, bug, 22, d)[0], "killed")
            self.assertEqual(checks.formal(self.v, self.v, 22, d)[0], "equivalent")


if __name__ == "__main__":
    unittest.main()
