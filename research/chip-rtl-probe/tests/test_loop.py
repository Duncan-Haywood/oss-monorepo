import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from chip_rtl_probe import check  # noqa: E402
from chip_rtl_probe.loop import Replay, run_task  # noqa: E402
from chip_rtl_probe.mutate import mutants  # noqa: E402

GOOD = "module sat_add8(input [7:0] a, input [7:0] b, output [7:0] y);\n  wire [8:0] s = a + b;\n  assign y = s[8] ? 8'hFF : s[7:0];\nendmodule\n"
WRAPS = "module sat_add8(input [7:0] a, input [7:0] b, output [7:0] y);\n  assign y = a + b;\nendmodule\n"
# differs from the reference on exactly one input pair (a=200, b=100), which 4000 random vectors miss
NARROW = GOOD.replace("assign y = s[8]", "assign y = (s[8] && !(a == 8'd200 && b == 8'd100))")


class Stub:
    name = "stub"

    def __init__(self, srcs):
        self.srcs = srcs

    def propose(self, task, history):
        return self.srcs[len(history)] if len(history) < len(self.srcs) else None


def ev(task, src):
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "c.v"
        f.write_text(src)
        return check.evaluate(task, f)


class CheckerTests(unittest.TestCase):
    def test_good_passes_all_stages(self):
        self.assertIsNone(ev("sat_add8", GOOD)["stage"])

    def test_syntax_error_fails_lint(self):
        self.assertEqual(ev("sat_add8", GOOD.replace("endmodule", ""))["stage"], "lint")

    def test_wrapping_adder_fails_sim_with_vector(self):
        r = ev("sat_add8", WRAPS)
        self.assertEqual(r["stage"], "sim")
        self.assertIn("MISMATCH", r["feedback"])

    def test_formal_catches_what_random_sim_misses(self):
        r = ev("sat_add8", NARROW)
        self.assertEqual((r["stage"], r["passed"]), ("formal", ["lint", "sim"]))

    def test_sequential_task_checks(self):
        src = (check.ROOT / "attempts" / "edge_det" / "round0.v").read_text()
        self.assertIsNone(ev("edge_det", src)["stage"])
        self.assertEqual(ev("edge_det", src.replace("d && !prev", "d"))["stage"], "sim")


class LoopTests(unittest.TestCase):
    def test_feedback_rounds_stop_at_first_pass(self):
        h = run_task("sat_add8", Stub([WRAPS, GOOD, WRAPS]))
        self.assertEqual([x["stage"] for x in h], ["sim", None])

    def test_gives_up_when_proposer_returns_none(self):
        self.assertEqual(len(run_task("sat_add8", Stub([WRAPS]))), 1)

    def test_every_task_has_attempt_and_reference(self):
        for t in check.task_names():
            self.assertTrue((check.TASKS / t / "ref.v").exists() and (check.TASKS / t / "tb.v").exists())
            self.assertIsNotNone(Replay().propose(t, []))


class MutateTests(unittest.TestCase):
    def test_mutants_differ_and_are_unique(self):
        ms = [m for _, m in mutants(GOOD)]
        self.assertGreater(len(ms), 5)
        self.assertEqual(len(ms), len(set(ms)))
        self.assertNotIn(GOOD, ms)


if __name__ == "__main__":
    unittest.main()
