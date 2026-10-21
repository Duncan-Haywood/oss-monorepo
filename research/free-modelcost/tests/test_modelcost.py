import math, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modelcost import compare, log_ratio, strata


def run(model, stratum, cost):
    return {"model": model, "stratum": stratum, "cost_usd": cost}


O, S = "claude-opus-5-5", "claude-sonnet-5-5"


class T(unittest.TestCase):
    def test_only_strata_with_both_models(self):
        runs = [run(O, ("d", "a"), 4), run(S, ("d", "a"), 1), run(S, ("d", "b"), 1)]
        self.assertEqual(list(strata(runs, "cost_usd")), [("d", "a")])

    def test_known_ratio(self):
        runs = [run(O, ("d", "a"), 4), run(S, ("d", "a"), 1), run(O, ("d", "b"), 9), run(S, ("d", "b"), 1)]
        self.assertAlmostEqual(math.exp(log_ratio(strata(runs, "cost_usd"))), 6.0)  # geometric mean of 4 and 9

    def test_confounding_removed(self):
        # Opus works only in the expensive stratum; pooled medians say 10x, matched says 2x.
        runs = [run(O, ("d", "big"), 20)] * 3 + [run(S, ("d", "big"), 10)] * 3 + [run(S, ("d", "small"), 1)] * 9
        c = compare(runs, "cost_usd", boot=50)
        self.assertAlmostEqual(c["ratio"], 2.0)
        self.assertLessEqual(c["lo"], 2.0 + 1e-9)

    def test_no_overlap(self):
        self.assertIsNone(compare([run(O, ("d", "a"), 1)], "cost_usd"))


if __name__ == "__main__":
    unittest.main()
