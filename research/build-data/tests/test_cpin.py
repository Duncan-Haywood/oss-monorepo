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

    def test_target_sel_summary_picks_lowest_target_loss(self):
        import json, tempfile, os, rounds
        def cell(test, tl, tc):
            return dict(test_loss={"0.9": test}, test_loss_per_seed={"0.9": [test - 1, test, test + 1]},
                        tgt_loss={"0.9": tl}, tgt_closs={"0.9": tc}, tgt_loss_per_seed={"0.9": [tl, tl, tl]},
                        tgt_n=10, tgt_n_open=2)
        R = {}
        for h in ("sf", "seattle"):
            for Y in (2021, 2022):
                # target score ranks nc3 best in SF, stamp best in Seattle; test agrees except Seattle's oracle is nc5
                for v, test, tl, tc in (("cpin_es3_nc3", 70 if h == "sf" else 92, 10 if h == "sf" else 30, 5),
                                        ("cpin_es3_nc5", 72 if h == "sf" else 85, 20, 4),
                                        ("cpin_es3_nc5_stamp", 73 if h == "sf" else 86, 21, 3),
                                        ("cpin_es3_nc5_stamp_len", 74 if h == "sf" else 88, 22 if h == "sf" else 19, 6)):
                    R[f"{h} {Y} {v}"] = cell(float(test), float(tl), float(tc))
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "r.json")
            json.dump(R, open(path, "w"))
            out = rounds.target_sel_summary(path, tmp)
        self.assertEqual(len(out["cells"]), 4)
        sf = [c for c in out["cells"] if c["held"] == "sf"]
        se = [c for c in out["cells"] if c["held"] == "seattle"]
        self.assertTrue(all(c["pick"] == c["oracle"] == "cpin_es3_nc3" and c["regret"] == 0 for c in sf))
        self.assertTrue(all(c["pick"] == "cpin_es3_nc5_stamp_len" and c["oracle"] == "cpin_es3_nc5" for c in se))
        self.assertAlmostEqual(out["mean_regret"], 1.5)  # (0 + 0 + 3 + 3) / 4
        self.assertTrue(all(c["pick_closs"] == "cpin_es3_nc5_stamp" for c in out["cells"]))
        p = out["predictions"]
        self.assertTrue(p["G1"] and p["G4"])
        self.assertFalse(p["G0"])  # no prior files in tmp
        self.assertFalse(p["G3"])  # regret 1.5 > 0.5

    def test_target_follow_summary_scores_each_cohort(self):
        """Session 99: each selector (cohort k, plain or IPCW) picks its own lowest score; F0 compares refits."""
        import json, tempfile, os, rounds
        def tk(l3, l6, i3):
            mk = lambda x: dict(n=10, n_open=2, loss={"0.9": x}, ipcw={"0.9": x}, loss_per_seed={"0.9": [x] * 3},  # noqa: E731
                                ipcw_per_seed={"0.9": [x] * 3})
            d = {"3": mk(l3), "5": mk(l6), "6": mk(l6)}
            d["3"]["ipcw"], d["3"]["ipcw_per_seed"] = {"0.9": i3}, {"0.9": [i3] * 3}
            return d
        R, P = {}, {}
        for h in ("sf", "seattle"):
            for Y in (2021, 2022):
                se = h == "seattle"
                for v, test, l3, l6, i3 in (("cpin_es3_nc3", 92 if se else 70, 10, 30 if se else 10, 30 if se else 5),
                                            ("cpin_es3_nc5", 85 if se else 72, 20, 20, 20),
                                            ("cpin_es3_nc5_stamp", 86 if se else 73, 21, 21, 21),
                                            ("cpin_es3_nc5_stamp_len", 88 if se else 74, 22, 22, 22)):
                    R[f"{h} {Y} {v}"] = dict(test_loss={"0.9": float(test)}, tgt_k=tk(l3, l6, i3),
                                             test_loss_per_seed={"0.9": [float(test)] * 3})
                    P[f"{h} {Y} {v}"] = dict(test_loss={"0.9": float(test)}, tgt_loss={"0.9": float(l3)})
        with tempfile.TemporaryDirectory() as tmp:
            path, pp = os.path.join(tmp, "r.json"), os.path.join(tmp, "p.json")
            json.dump(R, open(path, "w")); json.dump(P, open(pp, "w"))
            out = rounds.target_follow_summary(path, pp)
        sf = [c for c in out["cells"] if c["held"] == "sf"]
        se = [c for c in out["cells"] if c["held"] == "seattle"]
        self.assertTrue(all(c["pick"]["k3_loss"] == "cpin_es3_nc3" for c in out["cells"]))
        self.assertTrue(all(c["pick"]["k6_loss"] == "cpin_es3_nc3" for c in sf))
        self.assertTrue(all(c["pick"]["k6_loss"] == "cpin_es3_nc5" for c in se))
        self.assertTrue(all(c["pick"]["k3_ipcw"] == "cpin_es3_nc5" for c in se))
        self.assertEqual(out["mean_regret"]["k6_loss"], 0.0)
        self.assertAlmostEqual(out["mean_regret"]["k3_loss"], 3.5)  # (0 + 0 + 7 + 7) / 4
        self.assertEqual(se[0]["nc5_minus_nc3"]["k6_loss"], -10.0)
        p = out["predictions"]
        self.assertTrue(all(p[k] for k in ("F0", "F1", "F2", "F3", "F4", "F5")))

    def test_replicate_summary_pools_new_austin_and_old_cells(self):
        """Session 100: selectors whose cohort is missing are skipped; hits, regret and H1-H6 over the cell sets."""
        import json, tempfile, os, rounds
        def tk(l3, l6, ks=("3", "5", "6", "8")):
            mk = lambda x: dict(n=10, n_open=2, loss={"0.9": x}, ipcw={"0.9": x}, loss_per_seed={"0.9": [x] * 3},  # noqa: E731
                                ipcw_per_seed={"0.9": [x] * 3})
            return {k: mk(l3 if k == "3" else l6) for k in ks}
        def put(R, h, Y, long_city, ks):
            for v, test, l3, l6 in (("cpin_es3_nc3", 92 if long_city else 70, 10, 30 if long_city else 10),
                                    ("cpin_es3_nc5", 85 if long_city else 72, 20, 20),
                                    ("cpin_es3_nc5_stamp", 86 if long_city else 73, 21, 21),
                                    ("cpin_es3_nc5_stamp_len", 88 if long_city else 74, 22, 22)):
                R[f"{h} {Y} {v}"] = dict(test_loss={"0.9": float(test)}, tgt_k=tk(l3, l6, ks), n_test=5,
                                         test_loss_per_seed={"0.9": [float(test)] * 3})
        R, O = {}, {}
        for h, Y in rounds.REP_NEW + rounds.REP_AUSTIN:
            put(R, h, Y, h != "sf", ("3", "5", "6", "8"))
        for h, Y in rounds.REP_OLD:
            put(O, h, Y, h == "seattle", ("3", "5", "6"))
        with tempfile.TemporaryDirectory() as tmp:
            path, op = os.path.join(tmp, "r.json"), os.path.join(tmp, "o.json")
            json.dump(R, open(path, "w")); json.dump(O, open(op, "w"))
            out = rounds.replicate_summary(path, op)
        self.assertIn("k8_loss", out["new"][0]["pick"])
        self.assertNotIn("k8_loss", out["old"][0]["pick"])
        self.assertNotIn("k8_loss", out["agg_all"]["hits"])  # absent in the old cells
        self.assertEqual(out["agg_new"]["hits"]["k6_loss"], 4)
        self.assertEqual(out["agg_new"]["hits"]["k3_loss"], 2)  # wrong in both Seattle cells
        self.assertAlmostEqual(out["agg_all"]["mean_regret"]["k3_loss"], 7 * 6 / 10)
        self.assertTrue(all(out["predictions"][k] for k in ("H1", "H2", "H3", "H4", "H5", "H6")))

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

    def test_recent_threshold(self):
        """Session 104: the recent cut counts only builds completed in the 3 years before D."""
        import datetime, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(start=["2010-01-01", "2014-01-01", "2016-06-01", "2019-06-01", "2019-12-01",
                                     "2013-01-01"],
                              y=[100.0, 1500.0, 600.0, 50.0, 400.0, np.inf]))
        # 2010's build ended in 2010 (too old), 2019-12's ends after D, 2013's never ends: three count
        self.assertEqual(rounds.recent_threshold(d, D, q=1.0), 1500.0)
        self.assertEqual(rounds.recent_threshold(d, D, q=0.0), 50.0)
        self.assertEqual(rounds.recent_threshold(d, D, q=0.5), 600.0)
        self.assertIn("cpin_es3_ncr", rounds.VARIANTS)

    def test_dead_drop_and_attach_status(self):
        """Session 95: a dead close-out is dropped only when its completion date is known by D; a dead permit
        completed after D stays (as an open row on D), and the join is on permit id and completion day."""
        import datetime, os, tempfile, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(permit_id=["a", "b", "c", "d", "e"],
                              start=["2015-01-01", "2015-01-01", "2019-06-01", "2016-01-01", "2015-01-01"],
                              completed=["2015-05-01", "2016-01-01", "2020-03-01", "", "2015-05-01"],
                              y=[120.0, 365.0, 274.0, np.inf, 120.0]))
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "x_status.csv")
            pd.DataFrame(dict(permit_id=["a", "b", "c", "e"], completed=["2015-05-01", "2016-01-01", "2020-03-01",
                                                                          "2015-05-02"],
                              status=["Withdrawn", "Final", "Expired", "Void"], cai=["0", "0", "0", "0"],
                              group=["dead", "done", "dead", "dead"])).to_csv(p, index=False)
            m = rounds.attach_status(d, p)
        self.assertEqual(m["dead"].tolist(), [True, False, True, False, False])  # e: another completion day
        kept = rounds.dead_drop(m, D)
        self.assertEqual(kept.permit_id.tolist(), ["b", "c", "d", "e"])  # c closes after D: still open on D
        self.assertIn("cpin_es3_nc5_clean", rounds.VARIANTS)
        self.assertEqual(rounds.STALE["cpin_es3_nc5_clean"], rounds.STALE["cpin_es3_nc5"])

    def test_dead_drop_stamp_only(self):
        """Session 96: with stamp=180 only dead rows completed by D exactly 180 days after issue go; other dead
        closures, live 180-day builds and dead stamps completed after D stay."""
        import datetime, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(permit_id=list("abcde"),
                              start=["1995-01-01", "1995-01-01", "2010-01-01", "2019-08-01", "2016-01-01"],
                              y=[180.0, 400.0, 180.0, 180.0, np.inf], dead=[True, True, False, True, False]))
        self.assertEqual(rounds.dead_drop(d, D, stamp=rounds.STAMP_DAYS).permit_id.tolist(), list("bcde"))
        self.assertEqual(rounds.dead_drop(d, D).permit_id.tolist(), list("cde"))
        self.assertEqual(rounds.STALE["cpin_es3_nc3_clean"], rounds.STALE["cpin_es3_nc3"])
        self.assertEqual(rounds.STALE["cpin_es3_nc5_stamp"], rounds.STALE["cpin_es3_nc5"])
        self.assertTrue({"cpin_es3_nc5_stamp", "cpin_es3_nc3_clean"} <= set(rounds.VARIANTS))

    def test_len_drop_matches_dead_lengths_per_city(self):
        """Session 97: len_drop removes, per city and per decile bin of the non-stamp dead labels completed by D,
        as many live completed rows with labels in that bin; dead rows, stamps, open rows and other cities' rows
        beyond the matched count stay, and the draw is fixed by its seed."""
        import datetime, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        rng = np.random.default_rng(1)
        n = 400
        y = np.round(rng.uniform(1, 1500, n))
        dead = np.zeros(n, bool)
        dead[:20] = True
        y[20:30] = rounds.STAMP_DAYS  # live 180-day builds
        dead[30:35], y[30:35] = True, rounds.STAMP_DAYS  # dead stamps: not matched
        y = np.append(y, np.inf)
        dead = np.append(dead, False)
        city = np.where(np.arange(n + 1) < 300, "austin", "seattle")
        d = pd.DataFrame(dict(permit_id=[str(i) for i in range(n + 1)], start="2010-01-01", y=y, dead=dead,
                              city=city))
        kept, n_drop, short = rounds.len_drop(d, D)
        self.assertEqual((n_drop, short), (20, 0))  # all 20 non-stamp dead rows are Austin's
        gone = d[~d.permit_id.isin(kept.permit_id)]
        self.assertFalse(gone.dead.any())
        self.assertTrue((gone.city == "austin").all())
        self.assertTrue(np.isfinite(kept.y).sum() == n - 20)
        lo, hi = d.y[:20].min(), d.y[:20].max()
        self.assertTrue(((gone.y >= lo) & (gone.y <= hi)).all())
        e = np.quantile(d.y[:20], np.linspace(0, 1, 11))
        b = lambda v: np.clip(np.searchsorted(e, v, side="right") - 1, 0, 9)  # noqa: E731
        self.assertEqual(sorted(b(gone.y.to_numpy())), sorted(b(d.y[:20].to_numpy())))
        self.assertEqual(rounds.len_drop(d, D)[0].permit_id.tolist(), kept.permit_id.tolist())
        self.assertTrue({"cpin_es3_nc5_stamp_len", "cpin_es3_nc5_stamp_long"} <= set(rounds.DEAD_DROP))
        self.assertEqual(rounds.STALE["cpin_es3_nc5_stamp_len"], rounds.STALE["cpin_es3_nc5"])

    def test_dead_completed_mask(self):
        """Session 97: dead_completed marks dead rows completed by D only (the long-closure drop builds on it)."""
        import datetime, rounds
        import pandas as pd
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(start=["2010-01-01", "2010-01-01", "2019-08-01", "2010-01-01"],
                              y=[400.0, 400.0, 400.0, np.inf], dead=[True, False, True, True]))
        self.assertEqual(rounds.dead_completed(d, D).tolist(), [True, False, False, False])


if __name__ == "__main__":
    unittest.main()
