import importlib.util
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "triage7d"
spec = importlib.util.spec_from_file_location("triage7d_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
sys.modules["triage7d_run"] = run
spec.loader.exec_module(run)


class Triage7d(unittest.TestCase):
    def test_quant_matches_7c_index_rule(self):
        self.assertEqual(run.quant([4, 1, 3, 2], 0.75), 4)
        self.assertEqual(run.quant(list(range(24)), 0.75), 18)

    def test_flagged_takes_largest_scores(self):
        self.assertEqual(run.flagged([0.1, 0.9, 0.5, 0.7], 0.5), {1, 3})
        self.assertEqual(run.flagged([1, 2, 3], 0.0), set())
        self.assertEqual(run.flagged([1, 2, 3], 1.0), {0, 1, 2})

    def test_policy_endpoints_are_all10_and_all50(self):
        e10, e50 = [0.1, 0.2, 0.3, 0.4], [0.01, 0.02, 0.03, 0.04]
        s = [3, 1, 2, 0]
        self.assertEqual(run.q_policy(e10, e50, s, 0.0), run.quant(e10, 0.75))
        self.assertEqual(run.q_policy(e10, e50, s, 1.0), run.quant(e50, 0.75))

    def test_oracle_score_beats_random_on_a_clear_case(self):
        e10 = [0.01] * 15 + [0.2] * 5
        e50 = [0.01] * 20
        gain = [a - b for a, b in zip(e10, e50)]
        self.assertAlmostEqual(run.q_policy(e10, e50, gain, 0.25), 0.01)
        self.assertGreater(run.q_random(e10, e50, 0.25, ndraw=300), 0.01)

    def test_f_star_and_saved(self):
        self.assertEqual(run.f_star([0.3, 0.2, 0.1], 0.2, grid=[0, 0.5, 1]), 0.5)
        self.assertIsNone(run.f_star([0.3, 0.3], 0.2, grid=[0, 1]))
        self.assertAlmostEqual(run.saved(0.5), 0.4)
        self.assertAlmostEqual(run.saved(0.0), 0.8)
        self.assertAlmostEqual(run.saved(1.0), 0.0)

    def test_rows_reproduce_7b_and_7c(self):
        rs = json.loads((HERE / "rows.json").read_text())
        self.assertEqual(len(rs), 104)
        self.assertEqual(sorted({r["set"] for r in rs}), sorted(run.SETS))
        for r in rs:
            for c in run.CELLS:
                self.assertAlmostEqual(r["cells"][c]["e10"], r["cells"][c]["e10_7c"], places=12)


if __name__ == "__main__":
    unittest.main()
