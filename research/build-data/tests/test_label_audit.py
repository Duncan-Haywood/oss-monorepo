"""Session 94: src/label_audit.py's status groups and audit tables (offline; no feed is pulled)."""
import datetime as dt, os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import label_audit as la  # noqa: E402


class TestLabelAudit(unittest.TestCase):
    def test_group(self):
        self.assertEqual(la.group("Final"), "done")
        self.assertEqual(la.group(" completed "), "done")
        self.assertEqual(la.group("Void"), "dead")
        self.assertEqual(la.group("Cancelled - Contractor Required"), "dead")
        self.assertEqual(la.group("canceled"), "dead")
        self.assertEqual(la.group("Expired - License"), "dead")
        self.assertEqual(la.group("Issued"), "other")
        self.assertEqual(la.group("Active"), "other")
        # the closed-as-incomplete marker overrides a "Completed" status
        self.assertEqual(la.group("Completed", marker=True), "dead")

    def test_audit_tables(self):
        d = dt.date
        rows = ([("Final", d(2015, 1, 1), d(2015, 1, 11), "Building", False)] * 3
                + [("Void", d(2015, 1, 1), d(2016, 1, 1), "Building", False)]
                + [("Completed", d(2015, 1, 1), None, "Building", True)]
                + [("Issued", d(2021, 1, 1), None, "Building", False)])
        a = la.audit(rows)
        self.assertEqual(a["n"], 6)
        self.assertEqual(a["groups"]["done"]["n"], 3)
        self.assertEqual(a["groups"]["done"]["median_days"], 10)
        self.assertEqual(a["groups"]["dead"]["median_days"], 365)
        self.assertAlmostEqual(a["groups"]["dead"]["share"], 0.25)
        self.assertEqual(a["undated"], {"dead": 1, "other": 1})
        self.assertEqual(a["seattle_cai"], {"completed|undated": 1})
        # cure table needs >= 1,000 permits per type, so this tiny frame has none
        self.assertEqual(a["cure"], {})
        big = rows * 200
        c = la.audit(big)["cure"]["Building"]
        self.assertEqual(c["n"], 1000)  # the 2021 permit is outside the 2010-2020 cure window
        self.assertAlmostEqual(c["closes"], 0.6)
        self.assertAlmostEqual(c["dead"], 0.4)


def test_stamp_check_counts_exact_label():
    """Session 95: stamp_check counts rows exactly on the stamp per era and status group."""
    import os, sys, tempfile
    import pandas as pd
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import stamp_check
    with tempfile.TemporaryDirectory() as tmp:
        pd.DataFrame(dict(permit_id=["a", "b", "c", "d"], issued=["1990-01-01", "1990-01-01", "2015-01-01", "1995-03-01"],
                          completed=["1990-06-30", "1990-03-01", "2015-02-01", ""])).to_csv(f"{tmp}/x.csv", index=False)
        pd.DataFrame(dict(permit_id=["a", "b", "c"], completed=["1990-06-30", "1990-03-01", "2015-02-01"],
                          status=["VOID", "Final", "Final"], cai=["0"] * 3, group=["dead", "done", "done"])
                     ).to_csv(f"{tmp}/s.csv", index=False)
        d = stamp_check.labels(f"{tmp}/x.csv", f"{tmp}/s.csv")
    s = stamp_check.summarise(d)
    assert s["n"] == 3 and s["at_stamp"] == 1  # a: 1990-01-01 to 1990-06-30 is 180 days
    assert s["by_era"]["1900-1999 dead"]["share_at_stamp"] == 1.0
    assert s["by_era"]["1900-1999 done"]["at_stamp"] == 0


if __name__ == "__main__":
    unittest.main()
