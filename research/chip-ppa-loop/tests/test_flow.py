import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_loop import flow, sweep  # noqa: E402


def write(text):
    f = Path(tempfile.mkdtemp()) / "c.v"
    f.write_text(text)
    return f


class TestGate(unittest.TestCase):
    def test_reference_equivalent_to_itself(self):
        for d in ("add16", "mul6"):
            ref = ROOT / "designs" / f"{d}.v"
            self.assertTrue(flow.equivalent(ref, d, ref, d))

    def test_wrong_adder_rejected(self):
        bad = write("module add16(input [15:0] a, input [15:0] b, output [16:0] s); assign s = a | b; endmodule")
        self.assertFalse(flow.equivalent(ROOT / "designs/add16.v", "add16", bad, "add16"))

    def test_syntax_error_rejected(self):
        self.assertFalse(flow.equivalent(ROOT / "designs/add16.v", "add16", write("module add16("), "add16"))

    def test_seeded_bugs_rejected_and_fixes_accepted(self):
        P = ROOT / "proposals"
        ref = ROOT / "designs/add16.v"
        self.assertFalse(flow.equivalent(ref, "add16", P / "add16/a2_carry_select_bug.v", "add16"))
        self.assertTrue(flow.equivalent(ref, "add16", P / "add16/a3_carry_select.v", "add16"))
        self.assertFalse(flow.equivalent(ROOT / "designs/mul6.v", "mul6", P / "mul6/m3_off_by_one.v", "mul6"))

    def test_every_sweep_config_is_equivalent(self):
        for cfg in sweep.add16_config_space():
            self.assertTrue(flow.equivalent(ROOT / "designs/add16.v", "add16", write(sweep.gen_add16(*cfg)), "add16"), cfg)
        for cfg in sweep.mul6_config_space():
            self.assertTrue(flow.equivalent(ROOT / "designs/mul6.v", "mul6", write(sweep.gen_mul6(*cfg)), "mul6"), cfg)


class TestScore(unittest.TestCase):
    def test_ripple_has_fewer_cells_than_nothing_and_positive_depth(self):
        sc = flow.score(ROOT / "proposals/add16/a0_ripple.v", "add16")
        self.assertGreater(sc["cells"], 0)
        self.assertGreater(sc["depth"], 0)

    def test_score_is_deterministic(self):
        f = ROOT / "designs/mul6.v"
        self.assertEqual(flow.score(f, "mul6"), flow.score(f, "mul6"))


if __name__ == "__main__":
    unittest.main()
