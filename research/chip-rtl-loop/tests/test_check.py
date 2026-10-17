import tempfile
import unittest
from pathlib import Path

from chip_rtl_loop.check import check, first_failure, load_task, passed, ROOT, TASKS


def run(task, src):
    f = Path(tempfile.mkdtemp()) / "c.v"
    f.write_text(src)
    return check(load_task(task), f)[0]


class TestChecker(unittest.TestCase):
    def test_reference_renamed_passes(self):
        # the reference, with the module renamed, must pass every stage of its own task
        for d in sorted(TASKS.iterdir()):
            src = (d / "ref.v").read_text().replace(f"{d.name}_ref", d.name)
            res = run(d.name, src)
            self.assertTrue(passed(res), (d.name, res))

    def test_wrong_comb_design_fails_sim(self):
        res = run("gray2bin", "module gray2bin(input [7:0] g, output [7:0] b); assign b = g; endmodule")
        self.assertEqual(first_failure(res), "sim")
        self.assertIn("MISMATCH", res["sim"][1])

    def test_syntax_error_fails_lint(self):
        res = run("popcount", "module popcount(input [15:0] x, output [4:0] n); assign n = ; endmodule")
        self.assertEqual(first_failure(res), "lint")

    def test_wrong_seq_design_fails_sim(self):
        res = run("edge_det", "module edge_det(input clk, input rst, input x, output pulse); assign pulse = x; endmodule")
        self.assertEqual(first_failure(res), "sim")


if __name__ == "__main__":
    unittest.main()
