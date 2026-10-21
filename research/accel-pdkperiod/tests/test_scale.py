import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
from accel_pdkperiod import scale  # noqa: E402

SRC = os.path.join(ROOT, "openram")
SIBLING = os.path.join(ROOT, "..", "accel-pdkprice", "experiments", "results.json")


class T(unittest.TestCase):
    def test_energy_is_power_times_period(self):
        self.assertAlmostEqual(scale.energy_pj(10.0, 3.0), 30.0)   # 10 mW x 3 ns = 30 pJ
        self.assertAlmostEqual(scale.energy_pj(10.0, 3.0, per_edge=True), 15.0)

    def test_flip_scale_consistent_with_ws_wins(self):
        s = scale.flip_scale(4.0, 2.0)
        self.assertAlmostEqual(s, 2.0)
        self.assertFalse(scale.ws_wins(4.0, 2.0, s * 0.99))
        self.assertTrue(scale.ws_wins(4.0, 2.0, s * 1.01))

    def test_source_checks_on_fixture(self):
        lib = 'x write1_power y rise_power leakage_power_unit : \\"1mW\\" ;'
        meas = '.meas tran {0} avg {1} from={2}n to={3}n'
        dly = ('power_measure("write1_power", "RISE", measure_scale=1e3)\n'
               't_initial = self.cycle_times[self.measure_cycles[port][m]]\n'
               '        t_final = self.cycle_times[self.measure_cycles[port][m] + 1]')
        self.assertTrue(all(scale.source_checks(lib, dly, meas).values()))
        self.assertFalse(scale.source_checks(lib, dly.replace("1e3", "1"), meas)["mw_scale"])

    def test_data_copy_equals_sibling(self):
        if not os.path.exists(SIBLING):
            self.skipTest("sibling absent")
        self.assertEqual(json.load(open(SIBLING)), json.load(open(os.path.join(ROOT, "data", "pdkprice_results.json"))))

    def test_real_sources(self):
        if not os.path.isdir(SRC):
            self.skipTest("run sh fetch_openram.sh openram")
        r = lambda f: open(os.path.join(SRC, f)).read()
        c = scale.source_checks(r("lib.py"), r("delay.py"), r("measurements.py"))
        self.assertTrue(all(c.values()), c)


if __name__ == "__main__":
    unittest.main()
