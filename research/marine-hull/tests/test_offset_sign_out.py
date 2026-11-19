import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, EXP)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

O = None


def setUpModule():
    # Imported here: the import chain switches the shared climatology to 2005 to 2014; configure() sets 2015 to 2024,
    # which is also what the other modules expect, and restore() leaves it there.
    global O
    import run_offset_sign_out
    O = run_offset_sign_out


def tearDownModule():
    O.oc.use_clim(O.oc.DEFAULT_CLIM)


class OffsetSignOutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = O.configure()

    @classmethod
    def tearDownClass(cls):
        O.restore(cls.saved)

    def test_design_is_6zzzh_out(self):
        self.assertEqual(O.fy.CLIM_YEARS, tuple(range(2015, 2025)))
        self.assertEqual(O.YEARS, (2010, 2011, 2012, 2013, 2014))
        self.assertEqual(O.oz.KS, (3,))
        self.assertIs(O.oz.corrections, O.osg.corrections)

    def test_rules_are_6zzzj_rules(self):
        self.assertEqual(O.WIDTHS, (0.02, 0.05, 0.10))
        self.assertEqual(O.DS, (-0.03, -0.015, 0.0, 0.015, 0.03))
        self.assertEqual(len(O.oz.RULES), 1 + 15 * 10)

    def test_learning_years_lie_before_the_climatology(self):
        for y in O.YEARS:
            for s in O.oz.SETS[3]:
                self.assertTrue(all(x < 2015 for x in O.oz.learn_years(y, s)))

    def test_checks_have_one_value_per_year(self):
        for v in O.CHECK.values():
            self.assertEqual(len(v), len(O.YEARS))

    def test_results_checks_passed(self):
        path = os.path.join(EXP, "results_offset_sign_out.txt")
        if not os.path.exists(path) or "Predictions" not in open(path).read():
            self.skipTest("results not written yet")
        self.assertIn("all checks passed", open(path).read())


if __name__ == "__main__":
    unittest.main()
