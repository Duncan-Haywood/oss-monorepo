import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_costpermerge.join import pr_number, merged_numbers, status, wilson, cost_per_merged, summarise


class T(unittest.TestCase):
    def test_pr_number_forms(self):
        self.assertEqual(pr_number(7388), 7388)
        self.assertEqual(pr_number("https://github.com/o/r/pull/7250"), 7250)
        self.assertEqual(pr_number("#12"), 12)
        for bad in (None, "", "none", True):
            self.assertIsNone(pr_number(bad))

    def test_merged_numbers_squash_and_merge_commits(self):
        subs = ["feat: x (#10)", "Merge pull request #11 from a/b", "no number", "mentions (#12) midway text"]
        self.assertEqual(merged_numbers(subs), {10, 11})

    def test_status(self):
        self.assertEqual(status({"pr": 5}, {5}), "merged")
        self.assertEqual(status({"pr": 6}, {5}), "not_found")
        self.assertEqual(status({"pr": None}, {5}), "no_pr")

    def test_wilson_brackets_and_edges(self):
        lo, hi = wilson(5, 10)
        self.assertLess(lo, 0.5); self.assertGreater(hi, 0.5)
        self.assertEqual(wilson(0, 0), (0.0, 0.0))
        self.assertAlmostEqual(wilson(10, 10)[1], 1.0, places=6)

    def test_cost_per_merged_point_and_none(self):
        p, lo, hi = cost_per_merged([1.0, 3.0, 2.0, 2.0], [1, 0, 1, 0])
        self.assertAlmostEqual(p, 4.0)
        self.assertLessEqual(lo, p); self.assertGreaterEqual(hi, p)
        self.assertEqual(cost_per_merged([1.0], [0]), (None, None, None))

    def test_summarise_counts(self):
        runs = [{"track": "a", "cost_usd": 1.0, "status": "merged"}, {"track": "a", "cost_usd": 3.0, "status": "no_pr"},
                {"track": "b", "cost_usd": 2.0, "status": "merged"}]
        s = summarise(runs)
        self.assertEqual(s["all"]["n"], 3); self.assertEqual(s["a"]["merged"], 1)
        self.assertAlmostEqual(s["a"]["per_merged"], 4.0)
        self.assertAlmostEqual(s["all"]["unmerged_share"], 0.5)


if __name__ == "__main__":
    unittest.main()
