import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

F = None


def setUpModule():
    # Imported here, not at load time: importing it switches the shared climatology to 2005 to 2014, which would
    # leak into the other test modules that unittest discover loads first.
    global F
    import run_old_clim_2025
    F = run_old_clim_2025
    import run_old_clim_2025 as oc
    oc.use_clim(oc.OLD_CLIM)


def tearDownModule():
    import run_old_clim_2025 as oc
    oc.use_clim(oc.DEFAULT_CLIM)


class OldClimatology2025Tests(unittest.TestCase):
    def test_climatology_is_the_old_decade_everywhere(self):
        self.assertEqual(F.fy.CLIM_YEARS, tuple(range(2005, 2015)))
        self.assertIs(F.oz.fy, F.fy)

    def test_no_learning_or_scored_year_lies_inside_the_climatology(self):
        for yr in F.YEARS:
            self.assertNotIn(yr, F.OLD_CLIM)
            for k in F.KS:
                for s in F.SETS[k]:
                    self.assertTrue(all(y >= 2015 for y in F.oz.learn_years(yr, s)))

    def test_climatology_uses_all_ten_old_years_and_differs_from_the_new(self):
        F.oz.load_2025()
        p = "North-Sea"
        old = F.fy._clim(p, 2025)
        new = F.oz.rc.climatology_wh(p, 2025, years=tuple(range(2015, 2025)))
        self.assertEqual(len(old), 365)
        ref = F.oz.rc.climatology_wh(p, 2025, years=F.OLD_CLIM)
        self.assertEqual(list(old), list(ref))
        self.assertNotEqual(list(old), list(new))

    def test_quoted_6zzze_numbers_match_its_results_file(self):
        txt = open(os.path.join(HERE, "..", "experiments", "results_oos_2025.txt")).read()
        self.assertIn("2025: AT_90 63  AP 68.2  AK 56.7  A1 53.8  C03 69.3  C15 53.7  HR 69.3", txt)


if __name__ == "__main__":
    unittest.main()
