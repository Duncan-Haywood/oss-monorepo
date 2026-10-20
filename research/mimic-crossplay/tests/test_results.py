"""Checks on the committed results: shapes, and that the stored numbers follow from the stored margins."""
import json, os, sys, unittest
import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import analysis, report  # noqa: E402


@unittest.skipUnless(os.path.exists(os.path.join(HERE, "results", "reddit_matrix.json")), "no results")
class CommittedResults(unittest.TestCase):
    def test_matrices_and_values_follow_from_margins(self):
        stored = json.load(open(os.path.join(HERE, "results.json")))["reports"]
        for r in stored:
            m = json.load(open(os.path.join(HERE, "results", f"{r['family']}_matrix.json")))
            n = m["n_test"] + m["n_fresh"]
            self.assertEqual(n, 48)
            A = report.acc_matrix(m["margins"], list(range(n)))
            self.assertEqual(A.shape, (len(m["imitators"]), len(m["detectors"])))
            np.testing.assert_allclose(A, r["matrix"], atol=1e-4)
            x, w, v = analysis.solve_zero_sum(A)
            self.assertAlmostEqual(v, r["value"], places=6)
            # equilibrium: no pure deviation helps either side
            self.assertLess((x @ A).max() - v, 1e-6)
            self.assertLess(v - (A @ w).min(), 1e-6)

    def test_every_prompt_of_every_run_is_in_the_matrix(self):
        for fam in report.FAMILIES:
            m = json.load(open(os.path.join(HERE, "results", f"{fam}_matrix.json")))
            for p in report.PROPOSERS:
                for rnd in range(4):
                    report.index(m["imitators"], p, rnd)
                    report.index(m["detectors"], p, rnd)

    def test_texts_are_labelled_generated_data(self):
        m = json.load(open(os.path.join(HERE, "results", "reddit_matrix.json")))
        self.assertEqual(len(m["imitators"][0]["texts"]), 48)


if __name__ == "__main__":
    unittest.main()
