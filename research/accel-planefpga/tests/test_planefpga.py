import os
import shutil
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_planefpga import flow  # noqa: E402

HAVE_FPGA = shutil.which("yosys") and (shutil.which("nextpnr-ice40") or shutil.which("yowasp-nextpnr-ice40"))
HERE = os.path.dirname(os.path.abspath(__file__))


class TestModel(unittest.TestCase):
    def test_cycles_match_accel_plane_closed_form(self):
        self.assertEqual(flow.cycles("OS", 32), 2 * 70)       # 64 outputs on 32 lanes: 2 tiles of 70 inputs
        self.assertEqual(flow.cycles("RT", 32), 64 * 3)       # 70 inputs on 32 lanes: 3 tiles
        self.assertEqual(flow.cycles("RTp", 1), 64 * 70)

    def test_reduce_luts(self):
        self.assertEqual(flow.reduce_luts(4), 1)
        self.assertEqual(flow.reduce_luts(5), 2)
        self.assertEqual(flow.wrapper_luts("RT", 32), flow.wrapper_luts("RT", 1))

    def test_parse_stat(self):
        s = "   SB_CARRY   10\n   SB_DFF   5\n   SB_DFFESR   7\n   SB_LUT4   30\n   SB_MAC16   2\n"
        self.assertEqual(flow.parse_stat(s), {"synth_lc": 30, "synth_ff": 12, "synth_carry": 10, "synth_dsp": 2, "synth_ebr": 0})


@unittest.skipUnless(HAVE_FPGA, "needs yosys and nextpnr-ice40")
class TestFlow(unittest.TestCase):
    def test_os_lanes_keep_their_accumulators(self):
        # every lane's 24-bit accumulator must survive synthesis (outputs are XOR-reduced, not dropped)
        a, b = flow.run("OS", 1, False, seeds=(1,)), flow.run("OS", 4, False, seeds=(1,))
        self.assertGreaterEqual(b["synth_ff"] - a["synth_ff"], 3 * 24)
        self.assertTrue(a["fits"] and b["fits"])

    def test_dsp_flag_maps_multipliers(self):
        off, on = flow.run("RT", 4, False, seeds=(1,)), flow.run("RT", 4, True, seeds=(1,))
        self.assertEqual(off["synth_dsp"], 0)
        self.assertGreater(on["synth_dsp"], 0)
        self.assertLess(on["synth_lc"], off["synth_lc"])


if __name__ == "__main__":
    unittest.main()
