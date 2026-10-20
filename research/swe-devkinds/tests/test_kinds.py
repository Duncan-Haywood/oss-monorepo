import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_devkinds.kinds import kind, kinds_of, kind_vs_none


def run(track, whys, partial):
    return {"track": track, "deviations": [{"file": "f", "why": w} for w in whys],
            "outcome": "partial" if partial else "success"}


class T(unittest.TestCase):
    def test_kind(self):
        self.assertEqual(kind("gh token invalid, push failed"), "tooling")
        self.assertEqual(kind("Skipped the refresh"), "skipped")
        self.assertEqual(kind("picked another track"), "switched")
        self.assertEqual(kind("fine"), "other")
        self.assertEqual(kind(None), "other")

    def test_kinds_of(self):
        self.assertEqual(kinds_of({"deviations": []}), set())
        self.assertEqual(kinds_of({}), set())
        self.assertEqual(kinds_of(run("a", ["skipped x", "tool failed"], False)), {"skipped", "tooling"})

    def test_first_rule_wins(self):
        self.assertEqual(kind("skipped because the call failed"), "tooling")

    def test_kind_vs_none_detects_gap(self):
        runs = [run("a", ["tool failed"], True) for _ in range(5)] + [run("a", [], False) for _ in range(20)]
        d, p, n = kind_vs_none(runs, "tooling", lambda r: r["outcome"] == "partial", n=500)
        self.assertAlmostEqual(d, 1.0)
        self.assertLess(p, 0.05)
        self.assertEqual(n, 5)

    def test_small_strata_dropped(self):
        runs = [run("a", ["tool failed"], True)] + [run("a", [], False) for _ in range(5)]
        self.assertEqual(kind_vs_none(runs, "tooling", lambda r: True, n=50)[2], 0)

    def test_deterministic(self):
        runs = [run("a", ["skipped"], i % 2 == 0) for i in range(6)] + [run("a", [], i % 3 == 0) for i in range(9)]
        f = lambda r: r["outcome"] == "partial"
        self.assertEqual(kind_vs_none(runs, "skipped", f, n=200), kind_vs_none(runs, "skipped", f, n=200))
