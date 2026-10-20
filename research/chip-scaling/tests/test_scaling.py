import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "chip-abc-sweep", "src"))
from chip_abc_sweep.flow import score  # noqa: E402
from chip_scaling.blocks import BLOCKS, verilog  # noqa: E402
from chip_scaling.fit import power_fit  # noqa: E402


class FitTest(unittest.TestCase):
    def test_recovers_known_power(self):
        ws = [4, 8, 16, 32]
        p, c, r2 = power_fit(ws, [3 * w ** 2 for w in ws])
        self.assertAlmostEqual(p, 2.0, places=6)
        self.assertAlmostEqual(c, 3.0, places=6)
        self.assertAlmostEqual(r2, 1.0, places=6)

    def test_needs_two_points(self):
        with self.assertRaises(ValueError):
            power_fit([4], [10])


class BlockTest(unittest.TestCase):
    def test_every_block_synthesises_and_grows(self):
        with tempfile.TemporaryDirectory() as d:
            for kind in BLOCKS:
                cells = []
                for w in (4, 8):
                    src, top = verilog(kind, w)
                    f = os.path.join(d, top + ".v")
                    open(f, "w").write(src)
                    cells.append(score(f, top)["cells"])
                self.assertGreater(cells[1], cells[0], kind)

    def test_unknown_kind(self):
        with self.assertRaises(ValueError):
            verilog("nope", 4)


if __name__ == "__main__":
    unittest.main()
