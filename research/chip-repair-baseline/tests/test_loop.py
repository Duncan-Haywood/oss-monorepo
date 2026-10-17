import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_repair_baseline import check, mutation_search, task_names  # noqa: E402
from chip_repair_baseline.check import have_tools  # noqa: E402
from chip_repair_baseline.llm import llm_proposer, stub_proposer  # noqa: E402
from chip_repair_baseline.mutate import mutate  # noqa: E402


def rename(task):
    return (ROOT / "tasks" / task / "golden.v").read_text().replace(f"{task}_ref", task)


@unittest.skipUnless(have_tools(), "yosys, iverilog and verilator are required")
class LoopTests(unittest.TestCase):
    def test_every_golden_passes_its_own_checks(self):
        for t in task_names():
            r = check(t, rename(t))
            self.assertTrue(r["ok"], (t, r["feedback"]))

    def test_session_attempts_pass(self):
        for t in task_names():
            r = check(t, (ROOT / "attempts" / t / "round1.v").read_text())
            self.assertTrue(r["ok"], (t, r["feedback"]))

    def test_broken_design_fails_in_simulation(self):
        bad = rename("popcount8").replace("y + x[i]", "y + x[i] * 2")
        r = check("popcount8", bad)
        self.assertEqual(r["stage"], "sim")
        self.assertGreater(r["fail"], 0)

    def test_syntax_error_fails_at_compile(self):
        r = check("clz8", "module clz8(input [7:0] x, output [3:0] n); assign n = ;\nendmodule\n")
        self.assertEqual(r["stage"], "compile")

    def test_hill_climb_never_gets_worse_and_respects_budget(self):
        good = (ROOT / "attempts" / "gray2bin8" / "round1.v").read_text()
        solved, used, _ = mutation_search("gray2bin8", good, 5, seed=0)
        self.assertEqual((solved, used), (True, 1))  # already correct: one evaluation
        bad = good.replace("b[7] ^ g[6]", "b[7] & g[6]")
        start = check("gray2bin8", bad)["fail"]
        solved, used, best = mutation_search("gray2bin8", bad, 12, seed=0)
        self.assertLessEqual(used, 12)
        r = check("gray2bin8", best)
        self.assertTrue(r["ok"] or r["fail"] <= start)

    def test_mutation_is_deterministic(self):
        s = (ROOT / "attempts" / "div8" / "round1.v").read_text()
        a = mutate(s, random.Random(5))
        b = mutate(s, random.Random(5))
        self.assertEqual(a, b)

    def test_proposers_need_no_key_for_tests(self):
        self.assertIsNone(stub_proposer("clz8", "spec", []))
        import os
        if "ANTHROPIC_API_KEY" not in os.environ:
            self.assertIsNone(llm_proposer("clz8", "spec", []))


if __name__ == "__main__":
    unittest.main()
