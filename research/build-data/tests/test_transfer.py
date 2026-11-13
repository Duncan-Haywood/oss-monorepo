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

    def test_nodemo_folds_demolition_into_alteration_and_keeps_the_label(self):
        """Session 76: cascade2_nodemo merges demolition into alteration, nothing else."""
        p = self.write(["seattle,1,building,,100,2020-01-01,2020-02-01,,98101,40,other,demolition",
                        "seattle,2,building,,100,2020-01-01,2020-01-05,,98101,10,other,alteration",
                        "seattle,3,building,,100,2020-01-01,2020-01-09,,98101,5,other,new_construction"],
                       ",desc_class,desc_class_v2")
        self.assertEqual(list(transfer.frame(p, "a2i", "cascade2")[0].cls), ["demolition", "alteration", "new_construction"])
        d = transfer.frame(p, "a2i", "cascade2_nodemo")[0]
        self.assertEqual(list(d.cls), ["alteration", "alteration", "new_construction"])
        self.assertEqual(list(d.cls_unfolded), ["demolition", "alteration", "new_construction"])

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


@unittest.skipIf(transfer is None, "needs pandas and lightgbm")
class TailFold(unittest.TestCase):
    """Session 77: the general fold rule reads only training-time rows."""

    def frames(self, test_lag=5):
        import pandas as pd, numpy as np
        rng = np.random.default_rng(0)
        out = {}
        for city in ("sf", "austin", "seattle"):
            rows = []
            for year in range(2018, 2025):
                for cls in ("demolition", "alteration", "new_construction"):
                    n = 200
                    if city == "seattle" and year == 2024:
                        y = np.full(n, test_lag, float)  # test year: must not matter
                    elif cls == "demolition" and city != "seattle":
                        y = rng.uniform(0, 300, n)  # sources' demolition tail ~2x the target's
                    else:
                        y = rng.uniform(0, 150, n)
                    rows.append(pd.DataFrame(dict(year=year, cls=cls, y=y)))
            out[city] = pd.concat(rows, ignore_index=True)
        return out

    def test_flags_only_the_longer_source_tail_and_ignores_the_test_year(self):
        fold, diag = transfer.tailfold_map(self.frames(), "seattle", 2024, n_boot=200)
        self.assertEqual(fold, {"demolition": "alteration"})
        self.assertGreater(diag["demolition"]["q90"]["lo"], 1)
        fold2, _ = transfer.tailfold_map(self.frames(test_lag=10_000), "seattle", 2024, n_boot=200)
        self.assertEqual(fold, fold2)

    def test_small_classes_are_never_flagged_and_apply_fold_keeps_the_label(self):
        fold, diag = transfer.tailfold_map(self.frames(), "seattle", 2024, min_n=10_000, n_boot=50)
        self.assertEqual(fold, {})
        self.assertNotIn("q90", diag["demolition"])
        f = transfer.apply_fold(self.frames(), {"demolition": "alteration"})
        d = f["seattle"]
        self.assertFalse((d.cls == "demolition").any())
        self.assertTrue((d.cls_unfolded == "demolition").any())


if __name__ == "__main__":
    unittest.main()


@unittest.skipIf(transfer is None, "needs pandas and lightgbm")
class MinSupport(unittest.TestCase):
    """Session 81: classes with fewer than k source training rows fold into 'other'."""

    def frames(self):
        import pandas as pd
        src = pd.DataFrame(dict(year=[2018] * 5 + [2020] * 3, y=range(8),
                                cls=["alteration"] * 4 + ["plumbing"] + ["plumbing"] * 3))
        held = pd.DataFrame(dict(year=[2018] * 9, y=range(9), cls=["plumbing"] * 9))
        return {"sf": src, "austin": held}

    def test_counts_only_source_training_years(self):
        fold, n = transfer.minsup_map(self.frames(), "austin", 2020, k=2)
        self.assertEqual(n["plumbing"], 1)  # the 2020 rows are not training rows for Y=2020; Austin is never read
        self.assertEqual(n["alteration"], 4)
        self.assertEqual(fold, {c: "other" for c in transfer.CLASSES if c not in ("alteration", "other")})

    def test_k_zero_folds_nothing_and_other_never_folds(self):
        self.assertEqual(transfer.minsup_map(self.frames(), "austin", 2020, k=0)[0], {})
        self.assertNotIn("other", transfer.minsup_map(self.frames(), "austin", 2020, k=10 ** 9)[0])

    def test_name(self):
        self.assertEqual(transfer.minsup_k("cascade2_minsup1000"), 1000)
        self.assertIsNone(transfer.minsup_k("cascade2"))
        self.assertIsNone(transfer.minsup_k("cascade2_minsupx"))
