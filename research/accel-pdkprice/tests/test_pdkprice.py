import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_pdkprice import pdk  # noqa: E402

PDK = os.path.join(HERE, "..", "pdk", "orfs", "flow", "platforms")
SIBLING = os.path.join(HERE, "..", "..", "accel-fetchprice", "experiments", "results.json")

FIX = '''
library (x) { time_unit : "1ns"; voltage_unit : "1V"; current_unit : "1mA";
 cell ("ff") { cell_leakage_power : 0.5;
  pin ("CLK") { capacitance : 0.002;
   internal_power () {
    fall_power ("t") { index_1("1, 2"); values("0.02, 0.04"); }
    rise_power ("t") { index_1("1, 2"); values("0.01, 0.03"); }
   } }
  pin ("D") { capacitance : 0.001; internal_power () { rise_power ("t") { values("9"); } } }
 } }
'''
SRAM = '''library (m) { time_unit : "1ns" ; voltage_unit : "1V" ; current_unit : "1mA" ;
 pin(clk0){ internal_power(){ when : "a"; rise_power(scalar){ values("3.5"); } fall_power(scalar){ values("3.5"); } }
            internal_power(){ when : "b"; rise_power(scalar){ values("3.5"); } fall_power(scalar){ values("3.5"); } } } }'''


class T(unittest.TestCase):
    def test_units_check(self):
        self.assertTrue(pdk.units_ok(FIX))
        self.assertFalse(pdk.units_ok(FIX.replace("1mA", "1uA")))

    def test_flop_energy_from_fixture(self):
        f = pdk.flop_clock_energy(FIX, "ff", vdd=2.0)
        self.assertAlmostEqual(f["internal_pj"], 0.03 + 0.02)  # mean(rise) + mean(fall)
        self.assertAlmostEqual(f["pin_switch_pj"], 0.002 * 4.0)
        self.assertAlmostEqual(f["internal_lo_pj"], 0.03)
        self.assertAlmostEqual(f["internal_hi_pj"], 0.07)
        self.assertEqual(f["leak_nw"], 0.5)

    def test_other_pins_not_mixed_in(self):
        f = pdk.flop_clock_energy(FIX, "ff")
        self.assertLess(f["internal_hi_pj"], 1.0)  # D pin's 9 is not read

    def test_missing_cell(self):
        with self.assertRaises(KeyError):
            pdk.flop_clock_energy(FIX, "nope")

    def test_leakage_is_tiny(self):
        # 1 nW for 1 ns is 1e-18 J = 1e-6 pJ
        self.assertAlmostEqual(pdk.leakage_pj_per_cycle(1.0, 1.0), 1e-6)

    def test_sram_access(self):
        a = pdk.sram_access_energy(SRAM)
        self.assertEqual(a["rise_pj"], [3.5])
        self.assertEqual(a["fall_pj"], [3.5])

    def test_packing(self):
        self.assertEqual(pdk.weights_per_word(44), 11)
        self.assertEqual(pdk.e_weight_pj(11.0, 44, True), 1.0)
        self.assertEqual(pdk.e_weight_pj(11.0, 44, False), 11.0)

    def test_verdicts(self):
        self.assertEqual(pdk.verdict_flop(0.01, 0.046, 10.0), "WS")   # ratio 0.0046 < 0.01
        self.assertEqual(pdk.verdict_flop(0.01, 0.046, 1.0), "OS")    # ratio 0.046 > 0.01
        self.assertIsNone(pdk.verdict_flop(None, 0.046, 1.0))
        self.assertEqual(pdk.verdict_psum(0.4, 1.0, 10.0), "WS")
        self.assertEqual(pdk.verdict_psum(0.4, 10.0, 10.0), "OS")

    def test_packed_psum_ratio_never_below_one(self):
        # even with 24-bit partial sums packed as densely as 4-bit weights, a word holds
        # fewer sums than weights, so e_psum/e_weight = (W//4)/(W//24) >= 1 > any r_psum*
        for w in (44, 64, 80, 128):
            self.assertGreaterEqual((w // 4) / (w // 24), 1.0)

    def test_fetchprice_data_matches_sibling_when_present(self):
        mine = json.load(open(os.path.join(HERE, "..", "data", "fetchprice_results.json")))
        if os.path.exists(SIBLING):
            self.assertEqual(mine, json.load(open(SIBLING)))
        self.assertTrue(any(r["r_psum_star"] for r in mine))

    @unittest.skipUnless(os.path.isdir(PDK), "run: sh fetch_pdk.sh pdk")
    def test_real_dfxtp1(self):
        t = open(os.path.join(PDK, "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")).read()
        self.assertTrue(pdk.units_ok(t))
        f = pdk.flop_clock_energy(t)
        self.assertTrue(0.03 < f["internal_pj"] < 0.06)
        self.assertTrue(1.0 < f["pin_cap_ff"] < 3.0)

    @unittest.skipUnless(os.path.isdir(PDK), "run: sh fetch_pdk.sh pdk")
    def test_real_macros_read_equals_write_scalar(self):
        for n in ("sky130_sram_1rw1r_44x64_8", "sky130_sram_1rw1r_128x256_8"):
            t = open(os.path.join(PDK, "sky130ram", n, n + "_TT_1p8V_25C.lib")).read()
            a = pdk.sram_access_energy(t)
            self.assertEqual(len(a["rise_pj"]), 1)
            self.assertEqual(a["rise_pj"], a["fall_pj"])


if __name__ == "__main__":
    unittest.main()
