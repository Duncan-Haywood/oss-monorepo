import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import numpy as np
    import cpin
except ImportError:  # needs numpy/lightgbm
    cpin = None


@unittest.skipIf(cpin is None, "needs numpy and lightgbm")
class LeafMinimiser(unittest.TestCase):
    def test_matches_brute_force_over_candidate_points(self):
        """Session 90: the leaf value is the minimiser of the censored pinball loss over the leaf's rows."""
        rng = np.random.default_rng(0)
        for trial in range(40):
            n = int(rng.integers(5, 60))
            r = np.round(rng.normal(0, 10, n), 1)
            o = rng.random(n) < rng.random()
            leaf = rng.integers(0, 4, n)
            tau = float(rng.choice([0.1, 0.5, 0.9]))
            got = cpin.leaf_minimiser(r, o, leaf, tau, 4)
            for j in range(4):
                m = leaf == j
                if not m.any():
                    self.assertEqual(got[j], 0.0)
                    continue
                cand = np.unique(r[m])
                loss = [cpin.closs(r[m], d, o[m], tau).sum() for d in cand]
                best = min(loss)
                self.assertAlmostEqual(cpin.closs(r[m], got[j], o[m], tau).sum(), best, places=6)
                self.assertEqual(got[j], cand[np.flatnonzero(np.isclose(loss, best))[0]])  # the smallest minimiser

    def test_open_rows_raise_a_leaf_at_most_to_their_window(self):
        r = np.array([1.0, 2.0, 3.0, 500.0, 900.0])
        o = np.array([False, False, False, True, True])
        v = cpin.leaf_minimiser(r, o, np.zeros(5, int), 0.9, 1)[0]
        self.assertLessEqual(v, 900.0)
        only_open = cpin.leaf_minimiser(r[3:], o[3:], np.zeros(2, int), 0.9, 1)[0]
        self.assertEqual(only_open, 900.0)  # the loss says only "at least the largest window"

    def test_no_open_rows_is_the_ordinary_quantile(self):
        r = np.arange(1, 101, dtype=float)
        v = cpin.leaf_minimiser(r, np.zeros(100, bool), np.zeros(100, int), 0.9, 1)[0]
        self.assertEqual(v, 90.0)


@unittest.skipIf(cpin is None, "needs numpy and lightgbm")
class FitOne(unittest.TestCase):
    def test_without_open_rows_it_tracks_lightgbms_quantile_objective(self):
        """With every row completed the custom loop is quantile boosting with leaf renewal: its test pinball
        loss is within 3% of LightGBM's built-in quantile objective on the same data and parameters."""
        import lightgbm as lgb
        rng = np.random.default_rng(1)
        n = 6000
        X = rng.normal(size=(n, 3))
        y = np.exp(1 + X[:, 0] + 0.5 * rng.normal(size=n)) * 10
        tr, ca, te = slice(0, 4000), slice(4000, 5000), slice(5000, n)
        o = np.zeros(n, bool)
        pr, it = cpin.fit_one(X[tr], y[tr], o[tr], X[ca], y[ca], o[ca], X[te], 0.9, seed=0)
        p = dict(cpin.BASE, seed=0, objective="quantile", alpha=0.9, metric="quantile")
        m = lgb.train(p, lgb.Dataset(X[tr], y[tr]), 300, valid_sets=[lgb.Dataset(X[ca], y[ca])],
                      callbacks=[lgb.early_stopping(30, verbose=False)])
        ref = np.maximum(m.predict(X[te], num_iteration=m.best_iteration), 0)
        a = cpin.closs(y[te], pr, o[te], 0.9).mean()
        b = cpin.closs(y[te], ref, o[te], 0.9).mean()
        self.assertGreater(it, 0)
        self.assertLess(abs(a - b) / b, 0.03)

    def test_open_rows_do_not_blow_predictions_up(self):
        """No stand-in label: each leaf step is bounded by its largest residual, so predictions stay near the
        largest window (additive trees can still stack a little past it on rows the leaves never saw together)."""
        rng = np.random.default_rng(2)
        n = 3000
        X = rng.normal(size=(n, 2))
        y = np.exp(2 + X[:, 0] + rng.normal(size=n))
        c = np.full(n, 40.0)
        o = y > c
        yy = np.where(o, c, y)
        pr, _ = cpin.fit_one(X[:2000], yy[:2000], o[:2000], X[2000:], yy[2000:], o[2000:], X, 0.9, seed=0)
        self.assertLessEqual(pr.max(), 1.1 * max(yy.max(), 40.0))


@unittest.skipIf(cpin is None, "needs numpy and lightgbm")
class NeverCompleted(unittest.TestCase):
    """Session 91: permits never completed by the pull enter as open rows with their window at D."""

    def _csv(self, tmp):
        import csv
        rows = [dict(issued="2018-01-01", completed="2018-03-02"),   # done in 60 days
                dict(issued="2018-01-01", completed=""),             # never completed
                dict(issued="2014-01-01", completed=""),             # never completed, stale at D = 2020
                dict(issued="", completed="2018-02-01"),             # no start: dropped either way
                dict(issued="2019-12-01", completed="2020-06-01")]   # open at D = 2020-01-01, completed later
        path = os.path.join(tmp, "x.csv")
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, ["applied", "issued", "completed", "estimated_cost", "description_len"])
            w.writeheader()
            for r in rows:
                w.writerow(dict(applied="", estimated_cost="1000", description_len="10", **r))
        return path

    def test_load_frame_keep_open(self):
        import tempfile, boosted
        with tempfile.TemporaryDirectory() as tmp:
            p = self._csv(tmp)
            a, _ = boosted.load_frame(p, "i2c")
            b, _ = boosted.load_frame(p, "i2c", keep_open=True)
        self.assertEqual(len(a), 2)
        self.assertEqual(len(b), 4)
        self.assertEqual(int(np.isinf(b.y).sum()), 2)
        self.assertEqual(sorted(a.y.tolist()), sorted(b.y[np.isfinite(b.y)].tolist()))

    def test_censor_and_stale_drop(self):
        import datetime, tempfile, boosted, rounds, transfer
        with tempfile.TemporaryDirectory() as tmp:
            d, _ = boosted.load_frame(self._csv(tmp), "i2c", keep_open=True)
        D = datetime.date(2020, 1, 1)
        y, o = cpin.censor(d, D)
        self.assertEqual(o.tolist(), [False, True, True, True])
        self.assertEqual(y[1], (D - datetime.date(2018, 1, 1)).days)
        self.assertEqual(y[3], 31.0)  # completed after D: open, window 31 days
        kept = rounds.stale_drop(d, D)
        self.assertEqual(len(kept), 3)  # only the 2014 permit (open 2,191 days > 1,826) goes
        self.assertEqual(len(transfer.completed_by(d, D)), 1)

    def test_stale_thresholds_are_nested(self):
        import datetime, tempfile, boosted, rounds
        with tempfile.TemporaryDirectory() as tmp:
            d, _ = boosted.load_frame(self._csv(tmp), "i2c", keep_open=True)
        D = datetime.date(2020, 1, 1)
        n = {v: len(rounds.stale_drop(d, D, k)) for v, k in rounds.STALE.items()}
        self.assertEqual(rounds.STALE["cpin_es3_nc5"], rounds.STALE_DAYS)
        self.assertEqual(n["cpin_es3_nc2"], 3)  # the 2018 permit's window is exactly 730 days: kept (strict >)
        self.assertEqual(n["cpin_es3_nc8"], 4)  # 2,191 days < 2,922: nothing goes
        self.assertLessEqual(n["cpin_es3_nc3"], n["cpin_es3_nc5"])

    def test_sweep_summary_picks_lowest_selection_loss(self):
        import json, tempfile, os, rounds
        def cell(q90, sel):
            return dict(test_loss={"0.5": 10.0, "0.9": q90}, test_closs_all={"0.5": 1.0, "0.9": 1.0},
                        sel_closs={"0.5": 1.0, "0.9": sel}, rounds={"0": {"0.5": 5, "0.9": 7}},
                        n_train_never_completed=1, n_train_open=2, n_es_open=3)
        R, B, S = {}, {}, {}
        for h in ("sf", "seattle"):
            for Y in (2021, 2022):
                B[f"{h} {Y} full"] = {"test_loss": {"0.5": 10.0, "0.9": 100.0}}
                S[f"{h} {Y} cpin_es3"] = {"test_loss": {"0.9": 101.0}}
                S[f"{h} {Y} cpin_es3_nc5"] = {"test_loss": {"0.9": 99.0}}
                for v, q, sel in (("cpin_es3_nc2", 103, 50), ("cpin_es3_nc3", 98, 40),
                                  ("cpin_es3_nc5", 99, 45), ("cpin_es3_nc8", 104, 60)):
                    R[f"{h} {Y} {v}"] = cell(float(q), float(sel))
        with tempfile.TemporaryDirectory() as tmp:
            paths = []
            for name, obj in (("r", R), ("b", B), ("s", S)):
                paths.append(os.path.join(tmp, name + ".json"))
                json.dump(obj, open(paths[-1], "w"))
            out = rounds.sweep_summary(*paths)
        self.assertEqual(out["n_cells"], 4)
        self.assertTrue(all(c["selected"] == c["oracle"] == "cpin_es3_nc3" for c in out["cells"]))
        self.assertAlmostEqual(out["mean_change"]["selected"]["0.9"], -2.0)
        self.assertEqual(out["mean_regret_q90"], 0.0)
        self.assertTrue(out["held"]["S2"] and out["held"]["S3"] and out["held"]["S4"] and out["held"]["S5"])
        self.assertFalse(out["held"]["S1"])  # Seattle: nc3 is best, so S1's Seattle half fails

    def test_q_threshold(self):
        """Session 93: the per-source cut is a quantile of builds completed by D only."""
        import datetime, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(start=["2010-01-01", "2011-01-01", "2012-01-01", "2019-12-01", "2013-01-01"],
                              y=[100.0, 200.0, 300.0, 400.0, np.inf]))
        # the 2019 permit's 400 days end after D and the 2013 permit never completed: neither counts
        self.assertEqual(rounds.q_threshold(d, D, q=1.0), 300.0)
        self.assertEqual(rounds.q_threshold(d, D, q=0.5), 200.0)
        self.assertIn("cpin_es3_ncq", rounds.VARIANTS)


if __name__ == "__main__":
    unittest.main()
