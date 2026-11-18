import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, EXP)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

O = None


def setUpModule():
    # Imported here: importing it (through run_width_oos) switches the shared climatology to 2005 to 2014;
    # tearDownModule switches it back for the modules that test the 2015 to 2024 designs.
    global O
    import run_offset_sign
    O = run_offset_sign
    O.oc.use_clim(O.oc.OLD_CLIM)  # the import switches it only once per process


def tearDownModule():
    O.oc.use_clim(O.oc.DEFAULT_CLIM)


class OffsetSignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = O.configure()

    @classmethod
    def tearDownClass(cls):
        O.restore(cls.saved)

    def test_tags_are_distinct_and_named(self):
        self.assertEqual(len(set(O.TAG_ORDER)), len(O.WIDTHS) * len(O.DS))
        self.assertEqual(O.stag(0.10, -0.03), "C10m30")
        self.assertEqual(O.stag(0.02, 0.015), "C02p15")
        self.assertEqual(O.stag(0.05, 0.0), "C05z00")

    def test_zero_shift_is_the_plain_clamp(self):
        r = (0.90, 0.97, 1.0, 1.015, 1.06, 1.2)
        self.assertEqual(O.shifted(r, 0.02, 0.0), (0.98, 0.98, 1.0, 1.015, 1.02, 1.02))

    def test_shift_applies_before_the_clamp(self):
        r = (1.0, 0.99, 1.03)
        got = O.shifted(r, 0.02, -0.03)
        self.assertEqual(got[0], 0.98)  # 0.97 clamped
        self.assertAlmostEqual(got[2], 1.03 * 0.97)  # inside the clamp, not re-centred
        self.assertAlmostEqual(O.shifted(r, 0.10, 0.03)[1], 0.99 * 1.03)

    def test_rule_set_is_k3_only(self):
        self.assertEqual(O.oz.KS, (3,))
        self.assertEqual(len(O.oz.RULES), 1 + len(O.TAG_ORDER) * 10)
        self.assertIs(O.oz.corrections, O.corrections)

    def test_results_checks_passed(self):
        path = os.path.join(EXP, "results_offset_sign.txt")
        if not os.path.exists(path) or "Predictions" not in open(path).read():
            self.skipTest("results not written yet")
        self.assertIn("all checks passed", open(path).read())


if __name__ == "__main__":
    unittest.main()
