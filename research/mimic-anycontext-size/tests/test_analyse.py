"""Tests for summarise()/analyse(), the functions that produce every number in results.json.

Synthetic case: three candidates x two families ("a", "b"), scores chosen so each AUROC
(P(human score > machine score), ties half) can be counted by hand:

  cand 0, a: human [0]    machine [1]       0 of 1 pairs              -> 0
  cand 0, b: human [1, 0] machine [0.5, 2]  1>0.5 only: 1 of 4        -> 0.25
  cand 1, a: human [2]    machine [1]       1 of 1                    -> 1
  cand 1, b: human [0, 1] machine [1, 2]    1=1 tie: 0.5 of 4         -> 0.125
  cand 2, a and b: human [0] machine [1]                              -> 0, 0

  mean by candidate   [ (0+0.25)/2, (1+0.125)/2, 0 ] = [0.125, 0.5625, 0]
  pooled cand 0       human [0,1,0] vs machine [1,0.5,2]: 1 beats 0.5, ties 1   -> 1.5/9
  pooled cand 1       human [2,0,1] vs machine [1,1,2]: 2 beats 1,1, ties 2;
                      1 ties 1,1 -> 2.5 + 1 = 3.5/9
  pooled cand 2       human [0,0] vs machine [1,1] -> 0
  best of candidates  0.5625 (the middle one, so 'last' or 'first' is wrong);  flipped plain = 1 - 0.125 = 0.875
  cells below 0.5     cand0 a, cand0 b, cand1 b, cand2 a, cand2 b = 5 of 6
"""
import json, os, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import sizerun  # noqa: E402

PROJECT = os.path.dirname(HERE)
SYN = {
    0: {"a": {"test": {"human": [0.0], "llm": [1.0]}},
        "b": {"test": {"human": [1.0, 0.0], "llm": [0.5, 2.0]}}},
    1: {"a": {"test": {"human": [2.0], "llm": [1.0]}},
        "b": {"test": {"human": [0.0, 1.0], "llm": [1.0, 2.0]}}},
    2: {"a": {"test": {"human": [0.0], "llm": [1.0]}},
        "b": {"test": {"human": [0.0], "llm": [1.0]}}},
}


class SummariseSynthetic(unittest.TestCase):
    def setUp(self):
        self.r = sizerun.summarise(SYN)

    def test_families_sorted(self):
        self.assertEqual(self.r["families"], ["a", "b"])

    def test_plain_by_family(self):
        self.assertEqual(self.r["plain_by_family"], {"a": 0.0, "b": 0.25})

    def test_mean_by_candidate(self):
        for got, want in zip(self.r["mean_auroc_by_candidate"], [0.125, 0.5625, 0.0], strict=True):
            self.assertAlmostEqual(got, want, places=12)

    def test_pooled_by_candidate(self):
        for got, want in zip(self.r["pooled_auroc_by_candidate"], [1.5 / 9, 3.5 / 9, 0.0], strict=True):
            self.assertAlmostEqual(got, want, places=12)

    def test_best_and_flipped(self):
        self.assertAlmostEqual(self.r["best_candidate_mean"], 0.5625, places=12)
        self.assertAlmostEqual(self.r["flipped_plain_mean"], 0.875, places=12)

    def test_share_below_half(self):
        self.assertAlmostEqual(self.r["share_family_candidate_cells_below_half"], 5 / 6, places=12)

    def test_exactly_half_is_not_below_half(self):
        sc = {0: {"a": {"test": {"human": [0.0, 1.0], "llm": [0.5]}}}}  # AUROC exactly 0.5
        self.assertEqual(sizerun.summarise(sc)["share_family_candidate_cells_below_half"], 0.0)


class AnalyseCommittedCaches(unittest.TestCase):
    """analyse() on the committed score caches (no model needed) must reproduce results.json."""

    def setUp(self):
        self.committed = json.load(open(os.path.join(PROJECT, "results.json")))

    def test_out_none_does_not_write(self):
        p = os.path.join(PROJECT, "results.json")
        before = os.stat(p).st_mtime_ns
        sizerun.analyse(out=None)
        self.assertEqual(os.stat(p).st_mtime_ns, before)

    def test_matches_results_json(self):
        r = sizerun.analyse(out=None)
        self.assertEqual(sorted(r), sorted(self.committed))  # 3B has no cache, so it is skipped
        for m, want in self.committed.items():
            got = r[m]
            self.assertEqual(got["families"], want["families"])
            for k in ("mean_auroc_by_candidate", "pooled_auroc_by_candidate"):
                for g, w in zip(got[k], want[k], strict=True):
                    self.assertAlmostEqual(g, w, places=12, msg=f"{m} {k}")  # last-ulp: py<3.12 sum()
            for f, w in want["plain_by_family"].items():
                self.assertAlmostEqual(got["plain_by_family"][f], w, places=12)
            for k in ("best_candidate_mean", "flipped_plain_mean", "share_family_candidate_cells_below_half"):
                self.assertAlmostEqual(got[k], want[k], places=12, msg=f"{m} {k}")

    def test_readme_headlines(self):
        # Values quoted in the README and independently recomputed by the 2026-11-09 audit.
        r = sizerun.analyse(out=None)
        s, b = r["Qwen/Qwen2.5-0.5B-Instruct"], r["Qwen/Qwen2.5-1.5B-Instruct"]
        self.assertAlmostEqual(s["mean_auroc_by_candidate"][0], 0.2775, places=4)
        self.assertAlmostEqual(b["mean_auroc_by_candidate"][0], 0.3292, places=4)
        self.assertEqual(s["share_family_candidate_cells_below_half"] * 32, 32)
        self.assertEqual(b["share_family_candidate_cells_below_half"] * 32, 27)
        self.assertAlmostEqual(s["flipped_plain_mean"], 0.7225, places=4)
        self.assertAlmostEqual(b["flipped_plain_mean"], 0.6708, places=4)
        self.assertAlmostEqual(b["plain_by_family"]["news"], 0.5044, places=4)

    def test_writes_to_out(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "r.json")
            r = sizerun.analyse(out=p)
            self.assertEqual(json.load(open(p)), json.loads(json.dumps(r)))


if __name__ == "__main__":
    unittest.main()
