"""Session 108: floor5_summary (the 1-year cut for SF and Seattle; the chooser over 1 to 5 years)."""
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import tfol_boot  # noqa: E402

G4 = ("cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc4", "cpin_es3_nc5")


def old_cell(h, Y, test, k6, nc1=None):
    c = dict(held=h, year=Y, test=dict(zip(G4, test)), k6=dict(zip(G4, k6)))
    if nc1:
        c["nc1"], c["nc1_k6"] = nc1
    return c


def fit(test, k6, opn=0):
    return {"test_loss": {"0.9": test}, "n_train_open": opn, "n_es_open": 0,
            "tgt_k": {"6": {"n": 10, "n_open": 1, "loss": {"0.9": k6}}}}


class Floor5Score(unittest.TestCase):
    def run_summary(self, R):
        Ys = tfol_boot.ALL_YEARS
        # SF/Seattle: nc3 best (80), nc2 84, k6 ranks by length; Austin: nc1 60 best, nc2 62, k6 ranks by length
        cells = [old_cell(h, Y, (84.0, 80.0, 81.0, 82.0), (4.0, 5.0, 6.0, 7.0)) for h in ("sf", "seattle") for Y in Ys]
        cells += [old_cell("austin", Y, (62.0, 66.0, 75.0, 85.0), (4.0, 5.0, 6.0, 7.0), (60.0, 3.0)) for Y in Ys]
        with tempfile.TemporaryDirectory() as td:
            p, f = os.path.join(td, "r.json"), os.path.join(td, "f.json")
            json.dump(R, open(p, "w"))
            json.dump({"cells": cells}, open(f, "w"))
            return tfol_boot.floor5_summary(p, None, f)

    def test_short_lean_costs_sfse(self):
        # nc1 90 in SF/Seattle (6 worse than nc2, which is 4 worse than nc3) with the lowest k6: chooser5 takes it
        R = {f"{h} {Y} cpin_es3_nc1": fit(90.0, 3.0) for h in ("sf", "seattle") for Y in tfol_boot.ALL_YEARS}
        s = self.run_summary(R)
        P = s["predictions"]
        self.assertEqual(s["n"], 18)
        self.assertFalse(P["C0"])  # no rows dir
        self.assertEqual(s["open_rows_nc1"], [0] * 12)
        self.assertTrue(P["C1"] and P["C2"] and P["C5"])
        # chooser5: Austin 0, SF/Seattle 10 -> 120/18; chooser4 (nc2): Austin 2, SF/Seattle 4 -> 60/18
        self.assertAlmostEqual(s["chooser5_regret"], 120.0 / 18)
        self.assertAlmostEqual(s["chooser4_regret"], 60.0 / 18)
        self.assertFalse(P["C3"])
        self.assertFalse(P["C4"])
        self.assertEqual(s["oracle_counts"]["cpin_es3_nc1"], 6)
        # fixed: nc1 (0*6+10*12)/18, nc2 (2*6+4*12)/18 = 60/18, nc3 (6*6+0)/18 = 36/18 -> nc3 lowest
        self.assertTrue(P["C6"])

    def test_chooser_skips_nc1(self):
        # nc1 has a high k6 outside Austin: chooser5 = chooser4 there, and wins Austin
        R = {f"{h} {Y} cpin_es3_nc1": fit(86.0, 9.0, opn=5) for h in ("sf", "seattle") for Y in tfol_boot.ALL_YEARS}
        s = self.run_summary(R)
        P = s["predictions"]
        self.assertEqual(s["chooser5_picks_sfse"]["cpin_es3_nc1"], 0)
        self.assertTrue(P["C3"] and P["C4"])
        self.assertFalse(P["C2"] or P["C5"])  # gap 2 < 4
        self.assertFalse(P["C0"])

    def test_missing_cells(self):
        s = self.run_summary({"sf 2017 cpin_es3_nc1": fit(90.0, 3.0)})
        self.assertEqual(s["n"], 7)
        self.assertFalse(any(s["predictions"].values()))


if __name__ == "__main__":
    unittest.main()
