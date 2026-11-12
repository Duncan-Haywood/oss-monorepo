import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
try:
    import transfer
except ImportError:  # needs pandas/lightgbm
    transfer = None


@unittest.skipIf(transfer is None, "needs pandas and lightgbm")
class Harmonise(unittest.TestCase):
    def test_known_labels(self):
        h = transfer.harmonise
        self.assertEqual(h("PERMIT - NEW CONSTRUCTION"), "new_construction")
        self.assertEqual(h("PERMIT - ELECTRIC WIRING"), "electrical")
        self.assertEqual(h("Plumbing Permit"), "plumbing")
        self.assertEqual(h("wrecking/demolition"), "demolition")
        self.assertEqual(h("otc alterations permit"), "alteration")
        self.assertEqual(h("zzz"), "other")

    def test_every_output_is_a_class(self):
        for s in ["", "sign - erect", "Fire Alarm", "Mechanical Permit"]:
            self.assertIn(transfer.harmonise(s), transfer.CLASSES)


@unittest.skipIf(transfer is None, "needs pandas and lightgbm")
class Frame(unittest.TestCase):
    HDR = "city,permit_id,permit_type,work_class,estimated_cost,applied,issued,completed,area,description_len"

    def write(self, rows, extra=""):
        import tempfile
        f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
        f.write(self.HDR + extra + "\n" + "\n".join(rows) + "\n")
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def test_cascade_uses_description_class_only_for_other(self):
        p = self.write(["seattle,1,building,residential,100,2020-01-01,2020-02-01,,98101,40,new_construction",
                        "seattle,2,electrical,residential,100,2020-01-01,2020-01-05,,98101,10,demolition",
                        "seattle,3,building,residential,100,2020-01-01,2020-01-09,,98101,5,other"], ",desc_class")
        self.assertEqual(list(transfer.frame(p, "a2i")[0].cls), ["other", "electrical", "other"])
        self.assertEqual(list(transfer.frame(p, "a2i", "cascade")[0].cls), ["new_construction", "electrical", "other"])

    def test_cascade_refuses_an_old_pull(self):
        p = self.write(["seattle,1,building,,100,2020-01-01,2020-02-01,,98101,40"])
        with self.assertRaises(SystemExit):
            transfer.frame(p, "a2i", "cascade")


@unittest.skipIf(transfer is None, "needs pandas and lightgbm")
class Paired(unittest.TestCase):
    """Session 72: class configurations compared on the same test rows."""

    def frames(self, classes):
        import random, tempfile
        hdr = Frame.HDR + ",desc_class,desc_class_v2"
        out = {}
        for ci, city in enumerate(["chicago", "sf", "seattle"]):
            rng, rows = random.Random(ci), []
            for i in range(900):
                y = 2020 + i % 5
                kind = ["new_construction", "electrical", "alteration"][i % 3]
                lag = {"new_construction": 60, "electrical": 3, "alteration": 20}[kind] + rng.randint(0, 9)
                d0 = "%d-%02d-%02d" % (y, 1 + i % 12, 1 + i % 27)
                import datetime
                d1 = (datetime.date.fromisoformat(d0) + datetime.timedelta(days=lag)).isoformat()
                rows.append(f"{city},{city}{i},building,,{rng.randint(1, 9) * 1000},{d0},{d1},,1,{10 + i % 7},other,{kind}")
            f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
            f.write(hdr + "\n" + "\n".join(rows) + "\n")
            f.close()
            self.addCleanup(os.unlink, f.name)
            out[city] = transfer.frame(f.name, "a2i", classes)[0]
        return out

    def test_identical_runs_give_zero_and_a_better_class_gives_negative(self):
        ft, fc = self.frames("type"), self.frames("cascade2")
        rt = transfer.run(ft, "seattle", 2024, 1, keep_rows=True)
        rc = transfer.run(fc, "seattle", 2024, 1, keep_rows=True)
        z = transfer.paired(rt, rt, "type", "type")
        for t in ("0.1", "0.5", "0.9"):
            self.assertEqual((z["transfer"][t]["diff"], z["transfer"][t]["lo"], z["transfer"][t]["hi"]), (0.0, 0.0, 0.0))
        pr = transfer.paired(rt, rc, "type", "cascade2")
        # the work type sets the lag here, so knowing it must cut the median loss, CI below zero
        self.assertLess(pr["transfer"]["0.5"]["hi"], 0)
        self.assertLess(pr["own_boosted"]["0.5"]["hi"], 0)
        # session 75: per-class contributions add up to the overall difference
        bc = pr["by_class"]["transfer"]["0.5"]
        self.assertAlmostEqual(sum(v["contribution"] for v in bc.values()), pr["transfer"]["0.5"]["diff"])
        self.assertEqual(sum(v["n"] for v in bc.values()), pr["n_test"])

    def test_different_test_rows_are_refused(self):
        ft = self.frames("type")
        rt = transfer.run(ft, "seattle", 2024, 1, keep_rows=True)
        rs = transfer.run(ft, "sf", 2024, 1, keep_rows=True)
        with self.assertRaises(SystemExit):
            transfer.paired(rt, rs, "type", "type")


if __name__ == "__main__":
    unittest.main()
