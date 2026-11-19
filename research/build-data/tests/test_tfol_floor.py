"""Session 107: floor_summary (the staleness grid extended to 2 years, and 1 year for Austin)."""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import tfol_boot  # noqa: E402

G3 = ("cpin_es3_nc3", "cpin_es3_nc4", "cpin_es3_nc5")


def old_cell(h, Y, test, k6):
    t, k = dict(zip(G3, test)), dict(zip(G3, k6))
    return dict(held=h, year=Y, test=t, k6=k, oracle=min(t, key=t.get))


def fit(test, k6):
    return {"test_loss": {"0.9": test}, "tgt_k": {"6": {"n": 10, "n_open": 1, "loss": {"0.9": k6}}}}


class FloorScore(unittest.TestCase):
    def run_summary(self, R, sweep=None):
        Ys = tfol_boot.ALL_YEARS
        # SF/Seattle: nc3 best on test (80), k6 ranks by length; Austin: nc3 70, nc4 75, nc5 85
        grid = {"cells": [old_cell(h, Y, (80.0, 81.0, 82.0), (5.0, 6.0, 7.0)) for h in ("sf", "seattle") for Y in Ys]}
        aus = {"cells": [old_cell("austin", Y, (70.0, 75.0, 85.0), (5.0, 6.0, 7.0)) for Y in Ys]}
        with tempfile.TemporaryDirectory() as td:
            p, g, a, sw = (os.path.join(td, n) for n in ("r.json", "g.json", "a.json", "s.json"))
            for f, o in ((p, R), (g, grid), (a, aus), (sw, sweep or {})):
                json.dump(o, open(f, "w"))
            return tfol_boot.floor_summary(p, None, g, a, sw)

    def test_short_bias_hurts_chooser(self):
        R = {}
        for Y in tfol_boot.ALL_YEARS:
            R[f"austin {Y} cpin_es3_nc2"] = fit(68.0, 4.0)  # 2 days better than nc3
            R[f"austin {Y} cpin_es3_nc1"] = fit(72.0, 3.0)  # worse than nc2
            for h in ("sf", "seattle"):
                R[f"{h} {Y} cpin_es3_nc2"] = fit(84.0, 4.0)  # 4 days worse than nc3, but lowest k6
        s = self.run_summary(R)
        P = s["predictions"]
        self.assertFalse(P["B0"])  # no rows, no sweep
        self.assertTrue(P["B1"] and P["B2"] and P["B3"] and P["B5"])
        # chooser4 always picks nc2: regret 0 in Austin, 4 in SF/Seattle -> 48/18; chooser3 picks nc3: 2 in Austin -> 12/18
        self.assertAlmostEqual(s["chooser4_regret"], 48.0 / 18)
        self.assertAlmostEqual(s["chooser3_regret"], 12.0 / 18)
        self.assertTrue(P["B4"])
        self.assertTrue(P["B6"])  # nc3 12/18 against nc2 48/18
        self.assertEqual(s["oracle_counts"]["cpin_es3_nc2"], 6)
        self.assertEqual(s["nc1_above_nc2_austin"], 6)

    def test_sweep_reproduction(self):
        R = {f"{h} {Y} cpin_es3_nc2": fit(79.0, 9.0) for h in ("austin", "sf", "seattle") for Y in tfol_boot.ALL_YEARS}
        sweep = {f"{h} {Y} cpin_es3_nc2": {"test_loss": {"0.9": 79.05}} for h in ("austin", "sf", "seattle")
                 for Y in (2021, 2022)}
        s = self.run_summary(R, sweep)
        self.assertEqual(s["sweep_repro_n"], 6)
        self.assertAlmostEqual(s["sweep_repro_max_abs"], 0.05)
        self.assertFalse(s["predictions"]["B5"])  # no nc1 fits
        self.assertFalse(s["predictions"]["B3"])  # k6 9.0 is never the lowest


if __name__ == "__main__":
    unittest.main()
