import glob, json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_ihpprice import lib  # noqa: E402

PDK = os.path.join(HERE, "..", "pdk", "orfs", "flow", "platforms")
SIB = os.path.join(HERE, "..", "..")

STD = '''library (x) { capacitive_load_unit (1,pf); voltage_unit : "1V"; current_unit : "1uA"; time_unit : "1ns";
 leakage_power_unit : "1pW";
 cell (ff) { cell_leakage_power : 500;
  pin (CLK) { capacitance : 0.002;
   internal_power () { when : "D"; fall_power (t) { values("0.02, 0.04"); } rise_power (t) { values("0.01, 0.03"); } }
   internal_power () { when : "!D"; fall_power (t) { values("0.04, 0.06"); } rise_power (scalar) { values("0"); } } } }
 cell (icg) { pin (CLK) { capacitance : 0.004;
   internal_power () { when : "!E"; fall_power (t) { values("0.1, 0.1"); } rise_power (t) { values("0.05, 0.05"); } }
   internal_power () { when : "E"; fall_power (t) { values("0.5, 0.5"); } rise_power (t) { values("0.5, 0.5"); } } } } }'''
MAC = '''library (m) { capacitive_load_unit (1,pf); voltage_unit : "1V"; current_unit : "1uA"; time_unit : "1ns";
 pin(A_CLK) { capacitance : 0.0038;
  internal_power() { when : "!A_MEN  & !A_WEN & !A_REN"; rise_power("scalar"){ values (0); } fall_power("scalar"){ values (0); } }
  internal_power() { when : "A_MEN  & A_WEN  & !A_REN"; rise_power("scalar"){ values (60); } fall_power("scalar"){ values (0); } }
  internal_power() { when : "A_MEN  & !A_WEN & A_REN"; rise_power("scalar"){ values (50); } fall_power("scalar"){ values (0); } } } }'''


class T(unittest.TestCase):
    def test_energy_unit_is_cap_times_v2_not_current_time(self):
        self.assertAlmostEqual(lib.energy_unit_pj(STD), 1.0)       # pF x 1 V^2
        self.assertAlmostEqual(lib.vima_unit_pj(STD), 1e-3)        # uA x V x ns = fJ
        self.assertAlmostEqual(lib.energy_unit_pj(STD.replace("(1,pf)", '(1, "ff")')), 1e-3)

    def test_flop_averages_over_groups(self):
        f = lib.clock_pin_energy(STD, "ff", "CLK", vdd=2.0)
        self.assertAlmostEqual(f["internal_pj"], 0.05)             # (0.03+0.02) and (0.05+0) averaged
        self.assertAlmostEqual(f["pin_switch_pj"], 0.008)
        self.assertEqual(f["groups"], 2)
        self.assertAlmostEqual(lib.unit_ratio(f), 0.05 / 0.008)

    def test_when_filter_and_missing(self):
        g = lib.clock_pin_energy(STD, "icg", "CLK", vdd=1.0, when=["!E"])
        self.assertAlmostEqual(g["internal_pj"], 0.15)
        with self.assertRaises(ValueError):
            lib.clock_pin_energy(STD, "icg", "CLK", vdd=1.0, when=["nope"])
        with self.assertRaises(KeyError):
            lib.clock_pin_energy(STD, "nope", "CLK", vdd=1.0)

    def test_leakage_unit(self):
        # 500 pW over 10 ns = 5e-18 J = 5e-6 pJ
        self.assertAlmostEqual(lib.leakage_pj_per_cycle(STD, 500, 10.0), 5e-6)

    def test_macro_energies_and_dims(self):
        e = lib.macro_access_energy(MAC)
        self.assertEqual((e["read"], e["write"], e["idle"]), (50.0, 60.0, 0.0))
        self.assertEqual(lib.macro_dims("RM_IHPSG13_1P_256x64_c2_bm_bist_typ_1p20V_25C.lib"), (256, 64))
        self.assertIsNone(lib.macro_dims("other.lib"))

    def test_weight_energy_and_breakeven(self):
        self.assertEqual(lib.e_weight_pj(64.0, 64, True), 4.0)
        self.assertEqual(lib.e_weight_pj(64.0, 64, False), 64.0)
        self.assertAlmostEqual(lib.min_e_weight_pj(0.5, 0.25), 2.0)
        self.assertEqual(lib.gated_cost_per_flop_cycle(24.0, 24), 1.0)
        self.assertEqual(lib.min_group_size(10.0, 5.0, 0.1), 20)   # 10/G <= 0.5 at G = 20
        self.assertEqual(lib.min_group_size(10.0, 100.0, 0.1), 1)  # a gate per flop already wins
        self.assertIsNone(lib.min_group_size(10.0, 1.0, 0.1, leak_flop_pj=0.5))

    def test_fetchprice_copy_matches_sibling(self):
        sib = os.path.join(SIB, "accel-fetchprice", "experiments", "results.json")
        if not os.path.exists(sib):
            self.skipTest("sibling results not present")
        mine = json.load(open(os.path.join(HERE, "..", "data", "fetchprice_results.json")))
        self.assertEqual(mine, json.load(open(sib)))
        sk = json.load(open(os.path.join(HERE, "..", "data", "sky130_sram.json")))["macros"]
        self.assertEqual([m["width"] for m in sk], [44, 80, 64, 128])

    def test_real_libraries(self):
        if not os.path.isdir(PDK):
            self.skipTest("run: sh fetch_pdk.sh pdk")
        sky = open(os.path.join(PDK, "sky130hd", "lib", "sky130_fd_sc_hd__tt_025C_1v80.lib")).read()
        f = lib.clock_pin_energy(sky, "sky130_fd_sc_hd__dfxtp_1", "CLK", 1.8)
        self.assertAlmostEqual(f["total_pj"], 0.0464, places=3)    # accel-pdkprice's 46.4 fJ
        ihp = open(os.path.join(PDK, "ihp-sg13g2", "lib", "sg13g2_stdcell_typ_1p20V_25C.lib")).read()
        fi = lib.clock_pin_energy(ihp, "sg13g2_dfrbp_1", "CLK", 1.2)
        self.assertTrue(1 < lib.unit_ratio(fi) < 20)               # the pJ reading is the physical one
        m = open(glob.glob(os.path.join(PDK, "ihp-sg13g2", "lib", "RM_IHPSG13_1P_256x64_*typ_1p20V_25C.lib"))[0]).read()
        e = lib.macro_access_energy(m)
        self.assertAlmostEqual(e["read"], 49.634, places=3)
        self.assertLess(e["read"], e["write"])


if __name__ == "__main__":
    unittest.main()
