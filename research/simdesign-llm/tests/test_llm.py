import os, sys, json, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_llm import Problem, LB, UB, random_search, cma_es, bayes_opt, score_proposals, best_curve


class T(unittest.TestCase):
    def test_counts_and_bounds(self):
        p = Problem()
        r = p.evaluate([100, -5, 0])  # clipped to bounds
        self.assertEqual(p.n_evals, 1)
        self.assertEqual(r["x"], [UB[0], LB[1], LB[2]])

    def test_tighter_limits_exclude_old_optimum(self):
        r = Problem().evaluate([24.79, 10.34, 4.69])  # optimum of simdesign-bracket (20 MPa, 4 mm)
        self.assertFalse(r["feasible"])

    def test_big_section_feasible(self):
        r = Problem().evaluate([25, 10, 30])
        self.assertTrue(r["feasible"])

    def test_budgets_equal(self):
        for f in (random_search, cma_es, bayes_opt):
            p = Problem()
            recs = f(p, 14, 0)
            self.assertEqual(len(recs), 14)
            self.assertEqual(p.n_evals, 14)

    def test_determinism(self):
        a = [r["mass_g"] for r in random_search(Problem(), 5, 3)]
        b = [r["mass_g"] for r in random_search(Problem(), 5, 3)]
        self.assertEqual(a, b)

    def test_score_proposals_and_curve(self):
        d = tempfile.mkdtemp(); path = os.path.join(d, "r.json")
        json.dump({"round": 1, "notes": "", "designs": [[25, 10, 30], [3, 0, 4]]}, open(path, "w"))
        recs = score_proposals(Problem(), [path])
        self.assertEqual(len(recs), 2)
        c = best_curve(recs, [1, 2])
        self.assertEqual(c[0], c[1])
        self.assertTrue(np.isnan(best_curve(recs[1:], [1])[0]))


if __name__ == "__main__":
    unittest.main()
