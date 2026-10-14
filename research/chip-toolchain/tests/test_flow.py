import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from chip_toolchain import (DESIGNS as D, equivalent, lint, simulate,
                            synth_stats, tool_versions)
from chip_toolchain.flow import have

NEEDS = all(have(t) for t in ("yosys", "iverilog", "verilator"))


@unittest.skipUnless(NEEDS, "yosys, iverilog and verilator are required")
class FlowTests(unittest.TestCase):
    def test_versions_reported(self):
        v = tool_versions()
        self.assertTrue(v["yosys"].startswith("Yosys"))
        self.assertIn("Icarus", v["iverilog"])
        self.assertIn("Verilator", v["verilator"])

    def test_ripple_depth_is_2w_minus_1(self):
        for w in (4, 8, 16):
            s = synth_stats(D / "adder_ripple.v", "adder_ripple", {"W": w})
            self.assertEqual(s["depth"], 2 * w - 1)

    def test_ripple_area_linear(self):
        c = [synth_stats(D / "adder_ripple.v", "adder_ripple", {"W": w})["cells"]
             for w in (8, 16, 32)]
        self.assertAlmostEqual((c[2] - c[1]) / (c[1] - c[0]), 2.0, places=6)

    def test_flops_counted_in_fifo(self):
        s = synth_stats(D / "fifo.v", "fifo", {"W": 8, "AW": 2})
        flops = sum(n for t, n in s["by_type"].items() if "DFF" in t)
        # at least the 4x8 memory bits and two 3-bit pointers; Yosys adds a few more
        self.assertGreaterEqual(flops, 8 * 4 + 2 * 3)

    def test_equivalence_and_negative_control(self):
        self.assertTrue(equivalent(D / "adder_ripple.v", "adder_ripple",
                                   D / "adder_op.v", "adder_op", {"W": 6}))
        self.assertFalse(equivalent(D / "adder_ripple.v", "adder_ripple",
                                    D / "adder_bug.v", "adder_bug", {"W": 6}))

    def test_adder_simulation_matches_python(self):
        with tempfile.TemporaryDirectory() as t:
            lines = simulate("tb_adder", [D / "adder_ripple.v", D / "adder_op.v",
                                          D / "tb_adder.v"], t)
        vecs = [tuple(map(int, l.split())) for l in lines if l[:1].isdigit()]
        self.assertEqual(len(vecs), 256)
        for a, b, x, y in vecs:
            self.assertEqual((x, y), (a + b, a + b))

    def test_fifo_simulation(self):
        with tempfile.TemporaryDirectory() as t:
            lines = simulate("tb_fifo", [D / "fifo.v", D / "tb_fifo.v"], t)
        pushes = [l.split() for l in lines if l.startswith("push")]
        pops = [l.split() for l in lines if l.startswith("pop")]
        # depth 4: the fifth and sixth pushes are refused, so full stays set
        self.assertEqual([p[2] for p in pushes], ["0", "0", "0", "1", "1", "1"])
        self.assertEqual([int(p[1]) for p in pops[:4]], [10, 11, 12, 13])
        self.assertEqual(pops[4][3], "1")  # empty after four pops

    def test_lint_clean_and_known_warning(self):
        self.assertTrue(lint(D / "adder_op.v", "adder_op")[0])
        ok, msg = lint(D / "adder_ripple.v", "adder_ripple")
        self.assertFalse(ok)
        self.assertIn("UNOPTFLAT", msg)


if __name__ == "__main__":
    unittest.main()
