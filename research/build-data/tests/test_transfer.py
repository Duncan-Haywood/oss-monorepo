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


if __name__ == "__main__":
    unittest.main()
