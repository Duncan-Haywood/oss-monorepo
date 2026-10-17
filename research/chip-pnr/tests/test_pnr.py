import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_pnr.parse import parse_log  # noqa: E402
from chip_pnr.synth import DESIGNS, filtered_liberty, generic  # noqa: E402

LOG = """STAGE synth_netlist
Design area 100 um^2 100% utilization.
worst slack max -1.00
STAGE global_place
Design area 110 um^2 40% utilization.
worst slack max -1.20
STAGE detail_place
Design area 112 um^2 40% utilization.
worst slack max -1.10
STAGE final
Design area 130 um^2 45% utilization.
worst slack max 0.50
STAGE usage
Cell type report:                       Count       Area
  Tap cell                                 10      12.50
  Timing Repair Buffer                      3      15.00
  Inverter                                  2       7.50
  Multi-Input combinational cell           20      95.00
  Total                                    35     130.00
Group                  Internal  Switching    Leakage      Total
Total                  3.61e-05   2.29e-05   1.31e-10   5.90e-05 100.0%
"""

LIB = """library (x) {
  cell ("sky130_fd_sc_hd__and2_1") {
    area : 1;
    pin (A) { direction : input; }
  }
  cell ("sky130_fd_sc_hd__lpflow_isobufsrc_1") {
    area : 2;
    pin (A) { direction : input; }
  }
  cell ("sky130_fd_sc_hd__or2_1") {
    area : 3;
  }
}
"""


class TestParse(unittest.TestCase):
    def test_parse(self):
        r = parse_log(LOG, 5.0)
        self.assertEqual(r["synth_netlist_area"], 100.0)
        self.assertEqual(r["final_area_notap"], 117.5)
        self.assertEqual(r["final_cells"], 25)
        self.assertAlmostEqual(r["synth_netlist_period_ns"], 6.0)
        self.assertAlmostEqual(r["final_period_ns"], 4.5)
        self.assertEqual(r["buffers_added"], 3)
        self.assertAlmostEqual(r["power_w"], 5.9e-05)


class TestLiberty(unittest.TestCase):
    def test_filter_removes_only_dont_use(self):
        with tempfile.TemporaryDirectory() as t:
            src, dst = Path(t) / "a.lib", Path(t) / "b.lib"
            src.write_text(LIB)
            filtered_liberty(src, dst)
            out = dst.read_text()
            self.assertIn("and2_1", out)
            self.assertIn("or2_1", out)
            self.assertNotIn("lpflow", out)
            self.assertEqual(out.count("{"), out.count("}"))


@unittest.skipUnless(shutil.which("yosys"), "yosys not installed")
class TestGeneric(unittest.TestCase):
    def test_ripple_adder_cost(self):
        # chip-toolchain found 5W-3 cells, depth 2W-1 for this design and script
        with tempfile.TemporaryDirectory() as t:
            r = generic("adder_ripple", {"W": 8}, DESIGNS / "adder_ripple.v", t)
        self.assertEqual(r["gen_cells"], 37)
        self.assertEqual(r["gen_depth"], 15)


class TestResults(unittest.TestCase):
    def setUp(self):
        self.d = json.loads((ROOT / "experiments/results.json").read_text())

    def test_every_run_has_both_flows(self):
        self.assertGreaterEqual(len(self.d["runs"]), 13)
        for r in self.d["runs"]:
            self.assertGreater(r["synth_area_um2"], 0)
            self.assertGreaterEqual(r["final_area_notap"], r["synth_area_um2"] - 0.1)

    def test_mapped_area_matches_netlist_stage(self):
        for r in self.d["runs"]:
            self.assertAlmostEqual(r["synth_area_um2"], r["synth_netlist_area"], delta=0.6)  # OpenROAD prints areas to 3 significant figures


if __name__ == "__main__":
    unittest.main()
