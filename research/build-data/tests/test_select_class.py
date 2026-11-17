"""Session 83: the per-city class selector (src/select_class.py)."""
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np
    import select_class as sc
except ImportError:  # needs numpy/pandas
    sc = None


def rows(loss_by_cfg, n_weeks=20):
    """Fake censored_eval.fit(select=True) output: same per-row loss on selection and test rows."""
    R = {}
    for k, (sel, test) in loss_by_cfg.items():
        n = len(sel)
        wk = np.array([f"w{i % n_weeks}" for i in range(n)])
        R[k] = dict(loss={"transfer": {t: np.asarray(test, float) for t in sc.TAUS}}, weeks=wk,
                    _select=dict(loss={t: np.asarray(sel, float) for t in sc.TAUS}, weeks=wk,
                                 permit_id=np.arange(n)))
    return R


@unittest.skipIf(sc is None, "needs numpy and pandas")
class Selector(unittest.TestCase):
    def test_argmin_picks_lowest_selection_loss_and_regret_is_against_test_best(self):
        n = 200
        R = rows({"cascade2": ([5.0] * n, [5.0] * n), "type": ([3.0] * n, [6.0] * n), "drop": ([4.0] * n, [4.0] * n)})
        v = sc.evaluate(R, ["cascade2", "type", "drop"])["0.9"]
        self.assertEqual(v["picks"]["argmin"], "type")
        self.assertEqual(v["test_best"], "drop")
        self.assertAlmostEqual(v["regret"]["argmin"], 2.0)
        self.assertAlmostEqual(v["regret"]["always_cascade2"], 1.0)
        self.assertAlmostEqual(v["regret"]["always_drop"], 0.0)

    def test_gate_keeps_the_default_when_the_gain_is_noise(self):
        rng = np.random.default_rng(0)
        n = 400
        base = rng.normal(10, 3, n)
        noisy = base + rng.normal(-0.01, 3, n)  # tiny mean gain, wide interval
        R = rows({"cascade2": (base, base), "type": (noisy, noisy)})
        v = sc.evaluate(R, ["cascade2", "type"])["0.5"]
        self.assertEqual(v["picks"]["gated"], "cascade2")

    def test_gate_switches_on_a_clear_gain(self):
        n = 400
        base = np.linspace(5, 15, n)
        R = rows({"cascade2": (base, base), "type": (base - 2, base - 2)})
        v = sc.evaluate(R, ["cascade2", "type"])["0.5"]
        self.assertEqual(v["picks"]["gated"], "type")
        self.assertLess(v["selection"]["minus_first"]["type"]["hi"], 0)

    def test_ties_go_to_the_first_candidate(self):
        n = 50
        R = rows({"cascade2": ([1.0] * n, [1.0] * n), "type": ([1.0] * n, [1.0] * n)})
        self.assertEqual(sc.evaluate(R, ["cascade2", "type"])["0.9"]["picks"]["argmin"], "cascade2")

    def test_different_selection_rows_refused(self):
        n = 30
        R = rows({"cascade2": ([1.0] * n, [1.0] * n), "type": ([1.0] * n, [1.0] * n)})
        R["type"]["_select"]["permit_id"] = np.arange(n) + 1
        with self.assertRaises(SystemExit):
            sc.evaluate(R, ["cascade2", "type"])

    def test_summary_counts_cells_within_a_day(self):
        n = 100
        R = rows({"cascade2": ([5.0] * n, [5.0] * n), "type": ([3.0] * n, [7.0] * n)})
        res = dict(held_out="x", test_year=2021, by_tau=sc.evaluate(R, ["cascade2", "type"]))
        d = tempfile.mkdtemp()
        p = os.path.join(d, "r.json")
        json.dump(res, open(p, "w"))
        s = sc.summarise([p])
        self.assertEqual(s["n_cells"], 2)
        self.assertEqual(s["policies"]["argmin"]["cells_within_1day"], 0)
        self.assertEqual(s["policies"]["always_cascade2"]["cells_within_1day"], 2)
        self.assertAlmostEqual(s["policies"]["argmin"]["mean_regret"], 2.0)


if __name__ == "__main__":
    unittest.main()
