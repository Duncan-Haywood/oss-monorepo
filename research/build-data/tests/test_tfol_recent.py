"""Session 104: recent_score compares cpin_es3_ncr with the {3, 4, 5}-year grid oracle per cell."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import tfol_boot  # noqa: E402


def grid_cell(h, Y, nc3, nc4, nc5):
    t = {"cpin_es3_nc3": nc3, "cpin_es3_nc4": nc4, "cpin_es3_nc5": nc5}
    return dict(held=h, year=Y, test=t, oracle=min(t, key=t.get))


class RecentScore(unittest.TestCase):
    def setUp(self):
        self.grid = {"cells": [grid_cell(h, Y, 80.0, 81.0, 82.0) for h in ("sf", "seattle")
                               for Y in tfol_boot.ALL_YEARS]}

    def results(self, val, thr_early=1200.0, thr_late=1500.0):
        R = {}
        for h in ("sf", "seattle"):
            for Y in tfol_boot.ALL_YEARS:
                thr = thr_late if Y >= 2020 else thr_early
                R[f"{h} {Y} cpin_es3_ncr"] = {"test_loss": {"0.9": val(h, Y)},
                                              "stale_threshold_days": {"a": thr, "b": thr}}
        return R

    def test_all_hold(self):
        s = tfol_boot.recent_score(self.results(lambda h, Y: 80.5), self.grid)
        self.assertEqual(s["n"], 12)
        self.assertAlmostEqual(s["mean_regret"], 0.5)
        self.assertEqual(s["within_1day"], 12)
        self.assertTrue(all(s["predictions"].values()))
        self.assertAlmostEqual(s["grid_means"]["cpin_es3_nc4"], 81.0)

    def test_negative_regret_and_failures(self):
        # ncr beats the grid in SF, misses by 3 days in Seattle; the Seattle cut shortens late
        s = tfol_boot.recent_score(self.results(lambda h, Y: 79.0 if h == "sf" else 83.0, 1500.0, 1200.0),
                                   self.grid)
        self.assertAlmostEqual(s["mean_regret"], 1.0)
        self.assertEqual(s["beats_grid"], 6)
        self.assertEqual(s["within_1day"], 6)
        self.assertFalse(s["predictions"]["N1"])
        self.assertFalse(s["predictions"]["N2"])
        self.assertFalse(s["predictions"]["N3"])
        self.assertFalse(s["predictions"]["N4"])

    def test_incomplete_never_holds(self):
        R = self.results(lambda h, Y: 80.0)
        R.pop("sf 2017 cpin_es3_ncr")
        s = tfol_boot.recent_score(R, self.grid)
        self.assertEqual(s["n"], 11)
        self.assertFalse(s["predictions"]["N1"])


class OpenShares(unittest.TestCase):
    def test_open_shares(self):
        import datetime
        import numpy as np
        import pandas as pd
        import open_share
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(start=["2014-01-01", "2017-01-01", "2019-01-01", "2018-01-01", "2020-06-01"],
                              y=[np.inf, 2000.0, 400.0, 10.0, np.inf]))
        # open on D: 2014 (never done, 6 years), 2017 (ends 2022, 3 years open), 2019 (ends 2020-02);
        # 2018's ended in 2018 and 2020-06's is issued after D
        r = open_share.open_shares(d, D)
        self.assertEqual(r["n_open"], 3)
        self.assertAlmostEqual(r["share_open_over_3y"], 1 / 3)  # 2017-01-01 to D is 1,095 days: not over
        self.assertAlmostEqual(r["share_open_over_5y"], 1 / 3)

    def test_old_completions(self):
        import datetime
        import numpy as np
        import pandas as pd
        import open_share
        d = pd.DataFrame(dict(start=["2005-01-01", "2006-06-01", "2016-01-01", "2010-01-01"],
                              y=[4400.0, 3300.0, 100.0, np.inf]))
        # 2005 + 4,400 days ends in 2017; 2006-06 + 3,300 ends in 2015; 2016's is short; 2010 never ends
        oc = open_share.old_completions(d)
        self.assertEqual(oc["2017"], 1)
        self.assertEqual(oc["2015"], 1)
        self.assertEqual(sum(oc.values()), 2)
        self.assertAlmostEqual(open_share.recent_old_share(d, datetime.date(2018, 1, 1)), 2 / 3)  # all three end in 2015 to 2017


if __name__ == "__main__":
    unittest.main()


class Session105(unittest.TestCase):
    def test_batch_days(self):
        """A day closing more than BATCH_N permits issued over 8 years earlier drops every completion that day."""
        import datetime
        import numpy as np
        import pandas as pd
        import rounds
        n = rounds.BATCH_N + 1
        old = ["2005-01-01"] * n  # 11 old permits, all completed 2017-03-01 (> 8 years later)
        y_old = [(datetime.date(2017, 3, 1) - datetime.date(2005, 1, 1)).days] * n
        d = pd.DataFrame(dict(start=old + ["2016-01-01", "2016-02-29", "2005-01-01", "2015-01-01"],
                              y=y_old + [425.0, 366.0, 4000.0, np.inf]))
        m = rounds.batch_days(d)
        # the 2016-01-01 + 425 and 2016-02-29 + 366 builds also end 2017-03-01: masked; the lone old one is not
        self.assertEqual(m.tolist(), [True] * n + [True, True, False, False])
        self.assertFalse(rounds.batch_days(d.iloc[1:]).any())  # 10 old completions that day: not a batch

    def test_robust_threshold(self):
        import datetime
        import pandas as pd
        import rounds
        D = datetime.date(2020, 1, 1)
        d = pd.DataFrame(dict(start=[str(datetime.date(2019, 1, 1) - datetime.timedelta(days=k)) for k in
                                     range(100)], y=[float(k) for k in range(100)]))
        t95, nb = rounds.recent_threshold_robust(d, D, "cpin_es3_ncr95")
        self.assertAlmostEqual(t95, 94.05)
        self.assertEqual(nb, 0)
        self.assertIn("cpin_es3_ncrd", rounds.VARIANTS)

    def test_robust_summary(self):
        import json, tempfile
        grid = {"cells": [grid_cell(h, Y, 80.0, 81.0, 82.0) for h in ("sf", "seattle") for Y in tfol_boot.ALL_YEARS]}
        R = {}
        for v, val in (("cpin_es3_ncr95", 80.5), ("cpin_es3_ncrd", 84.0)):
            for h in ("sf", "seattle"):
                other = "seattle" if h == "sf" else "sf"
                for Y in tfol_boot.ALL_YEARS:
                    R[f"{h} {Y} {v}"] = {"test_loss": {"0.9": val},
                                         "stale_threshold_days": {other: 1500.0, "austin": 1200.0}}
        with tempfile.TemporaryDirectory() as td:
            p, g = os.path.join(td, "r.json"), os.path.join(td, "g.json")
            json.dump(R, open(p, "w"))
            json.dump(grid, open(g, "w"))
            s = tfol_boot.robust_summary(p, None, g)
        P = s["predictions"]
        self.assertFalse(P["M0"])  # no rows saved
        self.assertTrue(P["M1"] and P["M3a"] and P["M4"])
        self.assertFalse(P["M2"] or P["M3b"])
        self.assertAlmostEqual(s["variants"]["cpin_es3_ncrd"]["mean_regret"], 4.0)


class AustinSummary(unittest.TestCase):
    def test_austin_summary(self):
        import json, tempfile
        # 12 SF/Seattle cells: nc4 best by 1 day, chooser picks nc3
        grid = {"cells": [dict(grid_cell(h, Y, 81.0, 80.0, 81.0), regret={"cpin_es3_nc3": 1.0, "cpin_es3_nc4": 0.0,
                                                                         "cpin_es3_nc5": 1.0}, pick_regret=1.0)
                          for h in ("sf", "seattle") for Y in tfol_boot.ALL_YEARS]}
        R = {}
        for Y in tfol_boot.ALL_YEARS:
            for v, t, k6 in (("cpin_es3_nc3", 70.0, 1.0), ("cpin_es3_nc4", 75.0, 2.0), ("cpin_es3_nc5", 85.0, 3.0),
                             ("cpin_es3_ncrd", 80.0, 9.0)):
                R[f"austin {Y} {v}"] = {"test_loss": {"0.9": t}, "stale_threshold_days": {"sf": 1700.0},
                                        "tgt_k": {"6": {"n": 10, "n_open": 1, "loss": {"0.9": k6}}}}
        with tempfile.TemporaryDirectory() as td:
            p, g = os.path.join(td, "r.json"), os.path.join(td, "g.json")
            json.dump(R, open(p, "w"))
            json.dump(grid, open(g, "w"))
            s = tfol_boot.austin_summary(p, None, g)
        P = s["predictions"]
        self.assertFalse(P["A0"])  # no rows saved
        self.assertTrue(P["A1"] and P["A2"] and P["A4"])
        # pooled: nc3 (12*1 + 0)/18 = 0.667, nc4 (0 + 6*5)/18 = 1.667: nc3 lowest; chooser = nc3 exactly, not below
        self.assertTrue(P["A3"])
        self.assertFalse(P["A5"])
        self.assertAlmostEqual(s["pooled_fixed_regret"]["cpin_es3_nc4"], 30.0 / 18)
        self.assertAlmostEqual(s["austin_ncrd_regret"], 10.0)
        self.assertEqual(s["austin_chooser_picks"]["cpin_es3_nc3"], 6)

    def test_floor_summary(self):
        import json, tempfile
        # SF/Seattle: nc4 best (80), nc2 worst (84); k6 picks nc3 under both choosers
        k6g = {"cpin_es3_nc3": 1.0, "cpin_es3_nc4": 2.0, "cpin_es3_nc5": 3.0}
        grid = {"cells": [dict(grid_cell(h, Y, 81.0, 80.0, 81.0), k6=dict(k6g)) for h in ("sf", "seattle")
                          for Y in tfol_boot.ALL_YEARS]}
        # Austin: nc3 66 is best of {3, 4, 5}; nc2 64 beats it; k6 ranks nc2 lowest
        aus = {"cells": [dict(grid_cell("austin", Y, 66.0, 79.0, 84.0), k6=dict(k6g)) for Y in tfol_boot.ALL_YEARS]}
        R = {}
        for h in ("austin", "sf", "seattle"):
            for Y in tfol_boot.ALL_YEARS:
                t, k6 = (64.0, 0.5) if h == "austin" else (84.0, 9.0)
                R[f"{h} {Y} cpin_es3_nc2"] = {"test_loss": {"0.9": t}, "test_loss_per_seed": {"0.9": [t] * 3},
                                              "tgt_k": {"6": {"n": 10, "n_open": 1, "loss": {"0.9": k6}}}}
        with tempfile.TemporaryDirectory() as td:
            p, g, a = (os.path.join(td, n) for n in ("r.json", "g.json", "a.json"))
            json.dump(R, open(p, "w"))
            json.dump(grid, open(g, "w"))
            json.dump(aus, open(a, "w"))
            s = tfol_boot.floor_summary(p, None, g, a)
        P = s["predictions"]
        self.assertFalse(P["B0"])  # no rows saved
        self.assertTrue(P["B1"] and P["B2"])
        self.assertEqual(s["austin_nc2_beats_nc3"], 6)
        # chooser4: Austin picks nc2 (regret 0), SF/Seattle nc3 (1): 12/18; chooser3 picks nc3: Austin 2, SF/Se 1
        self.assertAlmostEqual(s["pooled_chooser4_regret"], 12.0 / 18)
        self.assertAlmostEqual(s["pooled_chooser3_regret"], 24.0 / 18)
        self.assertTrue(P["B3"])
        # fixed nc3: (12*1 + 6*2)/18 = 1.333; nc2: (12*4 + 0)/18 = 2.667
        self.assertAlmostEqual(s["pooled_fixed_regret"]["cpin_es3_nc2"], 48.0 / 18)
        self.assertTrue(P["B4"] and P["B5"])
