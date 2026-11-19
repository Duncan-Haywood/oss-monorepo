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
