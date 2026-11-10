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


if __name__ == "__main__":
    unittest.main()
