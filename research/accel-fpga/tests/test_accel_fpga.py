import os
import shutil
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_fpga import flow  # noqa: E402

HAVE_SIM = shutil.which("iverilog") and shutil.which("vvp")
HAVE_FPGA = shutil.which("yosys") and (shutil.which("nextpnr-ice40") or shutil.which("yowasp-nextpnr-ice40"))


class TestModel(unittest.TestCase):
    def test_ranges_and_shapes(self):
        for wb in (2, 4, 8):
            m = flow.random_model(70, 16, wb, 0)
            self.assertEqual(m.w1.shape, (16, 70))
            self.assertEqual(m.w2.shape, (11, 16))
            self.assertGreaterEqual(m.w1.min(), -(1 << (wb - 1)))
            self.assertLessEqual(m.w1.max(), (1 << (wb - 1)) - 1)

    def test_no_accumulator_overflow(self):
        x = np.full(70, -128)
        for wb in (2, 8):
            flow.reference_class(flow.random_model(70, 128, wb, 1), x)   # asserts on overflow

    def test_hex_width(self):
        self.assertEqual(flow._hex([-1, 3], 4), "f\n3\n")
        self.assertEqual(flow._hex([-1], 24), "ffffff\n")


@unittest.skipUnless(HAVE_SIM, "needs iverilog")
class TestRtl(unittest.TestCase):
    def test_top_matches_integer_reference(self):
        r = np.random.default_rng(0)
        for H, wb in ((8, 2), (16, 4), (8, 8)):
            m = flow.random_model(70, H, wb, H + wb)
            for _ in range(2):
                x = r.integers(-128, 128, 70)
                with tempfile.TemporaryDirectory() as d:
                    flow.write_hex(m, x, d)
                    self.assertEqual(flow.sim_class(m, x, d), flow.reference_class(m, x))


@unittest.skipUnless(HAVE_FPGA, "needs yosys and nextpnr-ice40 (or YoWASP)")
class TestFlow(unittest.TestCase):
    def test_small_design_fits_and_reports_fmax(self):
        m = flow.random_model(70, 8, 4, 0)
        x = np.random.default_rng(0).integers(-128, 128, 70)
        r = flow.synth_nextpnr(m, x, "up5k", seeds=(1,))
        self.assertTrue(r["fits"])
        self.assertGreater(r["fmax"], 5)
        self.assertGreater(r["pnr_lc"], 100)
        self.assertLess(r["pnr_lc"], 5280)


if __name__ == "__main__":
    unittest.main()
