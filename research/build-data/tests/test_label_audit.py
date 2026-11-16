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


if __name__ == "__main__":
    unittest.main()
