import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_gatedprice import lib  # noqa: E402

SIB = os.path.join(HERE, "..", "..")
FIX = '''library (x) { time_unit : 1ns; voltage_unit : 1V; current_unit : 1mA;
 cell (ff) { cell_leakage_power : 0.5;
  pin (CLK) { capacitance : 0.002;
   internal_power () { when : "D"; fall_power (t) { values("0.02, 0.04"); } rise_power (t) { values("0.01, 0.03"); } }
   internal_power () { when : "!D"; fall_power (t) { values("0.04, 0.06"); } rise_power (scalar) { values("0"); } } } }
 cell (icg) { pin (CLK) { capacitance : 0.004;
   internal_power () { when : "!E"; fall_power (t) { values("0.1, 0.1"); } rise_power (t) { values("0.05, 0.05"); } }
   internal_power () { when : "E"; fall_power (t) { values("0.5, 0.5"); } rise_power (t) { values("0.5, 0.5"); } } } }
}'''


class T(unittest.TestCase):
    def test_units_unquoted_and_quoted(self):
        self.assertTrue(lib.units_ok(FIX))
        self.assertTrue(lib.units_ok(FIX.replace("1ns;", '"1ns";')))
        self.assertFalse(lib.units_ok(FIX.replace("1mA", "1uA")))

    def test_flop_averages_over_groups(self):
        f = lib.clock_pin_energy(FIX, "ff", vdd=2.0)
        # group D: 0.03+0.02 = 0.05; group !D: 0.05 + 0 (placeholder rise) = 0.05
        self.assertAlmostEqual(f["internal_pj"], 0.05)
        self.assertAlmostEqual(f["pin_switch_pj"], 0.008)
        self.assertEqual(f["groups"], 2)
        self.assertEqual(f["cell_leakage"], 0.5)

    def test_when_filter_picks_idle_gate(self):
        g = lib.clock_pin_energy(FIX, "icg", when=["!E"])
        self.assertAlmostEqual(g["internal_pj"], 0.15)
        self.assertEqual(g["groups"], 1)
        with self.assertRaises(ValueError):
            lib.clock_pin_energy(FIX, "icg", when=["nope"])

    def test_missing_cell(self):
        with self.assertRaises(KeyError):
            lib.clock_pin_energy(FIX, "zzz")

    def test_gated_cost_and_threshold(self):
        self.assertAlmostEqual(lib.gated_cost_per_flop_cycle(0.04, 20, 0.001), 0.003)
        self.assertAlmostEqual(lib.min_e_weight_pj(0.003, 0.01), 0.3)

    def test_group_of_one_is_icg_energy(self):
        self.assertAlmostEqual(lib.gated_cost_per_flop_cycle(0.04, 1), 0.04)

    def test_copied_inputs_match_siblings(self):
        a = json.load(open(os.path.join(HERE, "..", "data", "fetchprice_results.json")))
        b = json.load(open(os.path.join(SIB, "accel-fetchprice", "experiments", "results.json")))
        self.assertEqual(a, b)
        s = json.load(open(os.path.join(HERE, "..", "data", "sky130_sram.json")))
        p = json.load(open(os.path.join(SIB, "accel-pdkprice", "experiments", "results.json")))
        self.assertEqual(s["macros"], p["macros"])

    def test_results_consistent(self):
        r = json.load(open(os.path.join(HERE, "..", "experiments", "results.json")))
        for g in r["g_star"]:
            if g["g_star"] is None:
                continue
            ratio = [m for m in r["min_e_weight"] if m["shape"] == g["shape"] and m["B"] == g["B"]][0]["ratio"]
            # at G* the gated cost is under the break-even; one fewer flop per gate (if G*>1) is not
            c = lambda G: r["e_icg_pj"] / G
            self.assertLess(c(g["g_star"]), g["e_weight_pj"] * ratio)
            if g["g_star"] > 1:
                self.assertGreaterEqual(c(g["g_star"] - 1) + 8.44e-5, g["e_weight_pj"] * ratio - 1e-6)

    def test_real_libraries_if_present(self):
        p = os.path.join(HERE, "..", "..", "accel-pdkprice", "pdk", "orfs", "flow", "platforms", "sky130hd", "lib",
                         "sky130_fd_sc_hd__tt_025C_1v80.lib")
        if not os.path.exists(p):
            self.skipTest("pdk not fetched")
        t = open(p).read()
        f = lib.clock_pin_energy(t, "sky130_fd_sc_hd__dfxtp_1", vdd=1.8)
        self.assertAlmostEqual(f["total_pj"], 0.04636, places=4)  # same as accel-pdkprice
        g = lib.clock_pin_energy(t, "sky130_fd_sc_hd__dlclkp_1", vdd=1.8)
        self.assertLess(g["total_pj"], f["total_pj"])


if __name__ == "__main__":
    unittest.main()
