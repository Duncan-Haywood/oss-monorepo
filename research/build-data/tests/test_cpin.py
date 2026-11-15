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


if __name__ == "__main__":
    unittest.main()
