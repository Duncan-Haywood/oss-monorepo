"""Session 84: the selector rescored on deployment-time selection sets (src/select_deploy.py)."""
import datetime, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np
    import select_deploy as sd
except ImportError:  # needs numpy/pandas
    sd = None


def sel_rows(year, y, loss, n_weeks=20):
    """Selection rows issued through `year`, one per day, with build time y and per-row loss."""
    n = len(y)
    start = [(datetime.date(year, 1, 1) + datetime.timedelta(days=i % 365)).isoformat() for i in range(n)]
    return dict(loss={t: np.asarray(loss, float) for t in sd.TAUS}, weeks=np.array([f"w{i % n_weeks}" for i in range(n)]),
                permit_id=np.arange(n), y=np.asarray(y, float), start=np.array(start))


def fake(cfg, test_year=2021, n=365, three=False):
    """cfg: {k: (loss_short, loss_long, test_loss)}; half the selection rows are short builds (10 days),
    half long (500 days, never completed by 1 January of the test year when issued in Y-1)."""
    y = np.where(np.arange(n) % 2 == 0, 10.0, 500.0)
    R = {}
    for k, (ls, ll, lt) in cfg.items():
        loss = np.where(y < 100, ls, ll)
        R[k] = dict(loss={"transfer": {t: np.full(200, lt, float) for t in sd.TAUS}}, y=np.zeros(200),
                    weeks=np.array([f"w{i % 20}" for i in range(200)]),
                    _select=sel_rows(test_year - 1, y, loss), _select2=sel_rows(test_year - 2, y, loss))
        if three:
            R[k]["_select3"] = sel_rows(test_year - 3, y, loss)
    return R


@unittest.skipIf(sd is None, "needs numpy and pandas")
class Deploy(unittest.TestCase):
    def test_truncation_hides_the_long_builds_from_year_y1(self):
        """A candidate that wins only on long builds wins on full1 but not on cc1 (its long rows are
        unseen at the decision date); in Y-2, 500-day builds issued before mid-August are seen."""
        R = fake({"cascade2": (5.0, 30.0, 6.0), "type": (6.0, 10.0, 5.0)})
        v, labels = sd.evaluate(R, ["cascade2", "type"], 2021)
        s = v["0.9"]["sets"]
        self.assertEqual(s["full1"]["picks"]["argmin"], "type")
        self.assertEqual(s["cc1"]["picks"]["argmin"], "cascade2")
        self.assertEqual(s["full2"]["picks"]["argmin"], "type")
        self.assertEqual(s["cc2"]["picks"]["argmin"], "type")
        self.assertEqual(labels["Y-1"]["n_seen"], 179)  # the 10-day builds, less those issued after 22 December
        self.assertGreater(labels["Y-2"]["n_seen"], 183)
        self.assertEqual(v["0.9"]["regret"]["cc1:argmin"], 1.0)
        self.assertEqual(v["0.9"]["regret"]["full1:argmin"], 0.0)
        self.assertEqual(v["0.9"]["regret"]["always_cascade2"], 1.0)

    def test_cc_weights_are_zero_on_unseen_rows_and_ipcw_upweights_long_seen_rows(self):
        R = fake({"cascade2": (5.0, 5.0, 5.0), "type": (5.0, 5.0, 5.0)})
        ws, lab = sd.set_weights(R["cascade2"]["_select2"], datetime.date(2021, 1, 1))
        seen = ws["cc"] > 0
        self.assertTrue(np.all(ws["ipcw"][~seen] == 0))
        self.assertTrue(np.all(ws["full"] == 1))
        y = R["cascade2"]["_select2"]["y"]
        self.assertGreater(ws["ipcw"][seen & (y == 500)].min(), ws["ipcw"][seen & (y == 10)].max())

    def test_gate_keeps_first_without_a_clear_win(self):
        R = fake({"cascade2": (5.0, 5.0, 5.0), "type": (4.99, 4.99, 6.0)})
        R["type"]["_select"]["loss"] = {t: R["cascade2"]["_select"]["loss"][t] + np.where(np.arange(365) % 3, -1.0, 2.0)
                                         for t in sd.TAUS}  # mean -0.01 a row, noisy
        v, _ = sd.evaluate(R, ["cascade2", "type"], 2021)
        self.assertEqual(v["0.5"]["sets"]["full1"]["picks"]["gated"], "cascade2")

    def test_year_y3_sees_every_500_day_build(self):
        """Session 85: issued in Y-3, a 500-day build is complete by 1 January Y, so cc3 = full3."""
        R = fake({"cascade2": (5.0, 30.0, 6.0), "type": (6.0, 10.0, 5.0)}, three=True)
        v, labels = sd.evaluate(R, ["cascade2", "type"], 2021)
        self.assertEqual(labels["Y-3"]["n_seen"], 365)
        s = v["0.9"]["sets"]
        self.assertEqual(s["cc3"]["picks"]["argmin"], "type")
        self.assertEqual(v["0.9"]["regret"]["ipcw3:gated"], 0.0)
        v2, _ = sd.evaluate(fake({"cascade2": (5.0, 5.0, 5.0), "type": (5.0, 5.0, 5.0)}), ["cascade2", "type"], 2021)
        self.assertNotIn("full3", v2["0.5"]["sets"])  # session 84 results (no _select3) still evaluate

    def test_compare_reports_relative_test_loss_change_and_best_agreement(self):
        """Session 85: compare() lines a run's test losses up with a baseline run's, cell by cell."""
        import json, tempfile
        def res(lt):
            return dict(held_out="sf", test_year=2021, by_tau={"0.5": dict(test_loss=lt, test_best=min(lt, key=lt.get))})
        d = tempfile.mkdtemp()
        pa, pb = os.path.join(d, "a.json"), os.path.join(d, "b.json")
        json.dump(res({"cascade2": 101.0, "type": 90.0}), open(pa, "w"))
        json.dump(res({"cascade2": 100.0, "type": 95.0}), open(pb, "w"))
        c = sd.compare([pa], [pb])
        self.assertEqual((c["n_cells"], c["same_best"], c["n_candidate_cells"], c["within_2pct"]), (1, 1, 2, 1))
        self.assertAlmostEqual(c["cells"][0]["rel_change"]["cascade2"], 0.01)

    def test_different_selection_rows_refused(self):
        R = fake({"cascade2": (5.0, 5.0, 5.0), "type": (5.0, 5.0, 5.0)})
        R["type"]["_select2"]["permit_id"] = np.arange(365) + 1
        with self.assertRaises(SystemExit):
            sd.evaluate(R, ["cascade2", "type"], 2021)


if __name__ == "__main__":
    unittest.main()
