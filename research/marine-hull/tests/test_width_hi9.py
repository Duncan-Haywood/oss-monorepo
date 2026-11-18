import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.join(HERE, "..", "experiments")
sys.path.insert(0, EXP)
sys.path.insert(0, os.path.join(HERE, "..", "src"))

H = None


def setUpModule():
    # Imported here, not at load time: importing it (through run_width_oos) switches the shared climatology to 2005
    # to 2014; tearDownModule switches it back for the modules that test the 2015 to 2024 designs.
    global H
    import run_width_hi9
    H = run_width_hi9
    H.oc.use_clim(H.oc.OLD_CLIM)  # the import switches it only once per process


def tearDownModule():
    H.oc.use_clim(H.oc.DEFAULT_CLIM)


class WidthHi9Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = H.configure()

    @classmethod
    def tearDownClass(cls):
        H.restore(cls.saved)

    def test_design_is_6zzzg_with_old_climatology(self):
        self.assertEqual(H.fy.CLIM_YEARS, tuple(range(2005, 2015)))
        self.assertEqual(H.YEARS, (2020, 2021, 2022, 2023, 2024, 2025))
        self.assertEqual(H.oz.TAG_ORDER, ("C01", "C02", "C03", "C04", "C05", "C07", "C10"))

    def test_nine_is_the_pool_6zzzh_printed(self):
        line = open(os.path.join(EXP, "results_width_new_clim.txt")).read().splitlines()[1]
        self.assertIn("high-amplitude nine: " + ", ".join(H.NINE) + ";", line)

    def test_five_is_6zzzg_pool_and_inside_nine(self):
        line = open(os.path.join(EXP, "results_width_oos.txt")).read().splitlines()[1]
        self.assertIn("five-point high-amplitude pool: " + ", ".join(H.FIVE) + ";", line)
        self.assertTrue(set(H.FIVE) <= set(H.NINE))

    def test_reads_6zzzh_in_rows_at_the_nine(self):
        r = H.new_clim_rows()
        self.assertEqual(r["AT_90"], {2020: 48.0, 2021: 12.0, 2022: 28.0, 2023: 37.0, 2024: 35.0, 2025: 73.0})
        self.assertEqual(r["C02"][2025], 78.1)
        self.assertEqual(r["C10"][2020], 37.1)

    def test_results_checks_passed(self):
        path = os.path.join(EXP, "results_width_hi9.txt")
        if not os.path.exists(path):
            self.skipTest("results not written yet")
        self.assertIn("all checks passed", open(path).read())


if __name__ == "__main__":
    unittest.main()
