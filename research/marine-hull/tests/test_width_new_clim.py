import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

N = None


def setUpModule():
    # Imported here, not at load time: importing it (through run_width_oos) switches the shared climatology to 2005
    # to 2014; use_new() switches it back, as main() does.
    global N
    import run_width_new_clim
    N = run_width_new_clim
    N.use_new()


def tearDownModule():
    N.use_new()


class WidthNewClimTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = N.configure()

    @classmethod
    def tearDownClass(cls):
        N.restore(cls.saved)

    def test_design_is_6zzze_climatology_with_6zzzg_rules(self):
        self.assertEqual(N.fy.CLIM_YEARS, tuple(range(2015, 2025)))
        self.assertEqual(N.OUT, (2010, 2011, 2012, 2013, 2014))
        self.assertEqual(N.IN, (2020, 2021, 2022, 2023, 2024, 2025))
        self.assertEqual(N.oz.TAG_ORDER, ("C01", "C02", "C03", "C04", "C05", "C07", "C10"))
        self.assertEqual(len(N.oz.RULES), 1 + 7 * (5 + 10 + 1))

    def test_learning_years_fall_outside_or_inside_the_climatology(self):
        clim = set(N.fy.CLIM_YEARS)
        for k in N.KS:
            for s in N.oz.SETS[k]:
                for y in N.OUT:
                    self.assertTrue(clim.isdisjoint(N.oz.learn_years(y, s)))
                for y in N.IN:
                    self.assertTrue(set(N.oz.learn_years(y, s)) <= clim)

    def test_scored_year_is_left_out_of_its_climatology(self):
        N.oz.load_2025()
        a = N.fy._clim("North-Sea", 2020)
        b = N.oz.rc.climatology_wh("North-Sea", 2020, years=tuple(y for y in range(2015, 2025) if y != 2020))
        self.assertEqual(tuple(a), tuple(b))

    def test_reads_6zzzg_paired_gains(self):
        g = N.g_gains("C02")
        self.assertEqual(g, {2020: 4.3, 2021: 13.1, 2022: 4.0, 2023: 8.2, 2024: 6.4, 2025: 5.4})

    def test_checks_quote_6zzze_results(self):
        txt = open(os.path.join(HERE, "..", "experiments", "results_oos_2025.txt")).read()
        self.assertIn("2025: AT_90 63  AP 68.2  AK 56.7  A1 53.8  C03 69.3  C15 53.7  HR 69.3", txt)
        self.assertIn("C03 k=5: all84  69.0 [69,69]", txt)


if __name__ == "__main__":
    unittest.main()
