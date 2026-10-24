import datetime as D
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_reviewdup import reviews as R

LOG = """@@aaa|2026-10-19T13:18:47-06:00|prompts: review 2026-10-19 (seventh) (#8488)

prompts/runs/x.json
prompts/routing.json

@@bbb|2026-10-19T13:19:46-06:00|prompts: review 2026-10-19 (seventh) (#8489)

prompts/runs/y.json
prompts/routing.json
prompts/README.md

@@ccc|2026-10-19T08:20:09-06:00|prompts: review 2026-10-19 (sixth) (#8421)

prompts/runs/z.json

@@ddd|2026-10-19T09:00:00-06:00|ventures/foo: a feature (#1)

ventures/foo/a.js
@@eee|2026-10-18T09:00:00-06:00|prompts: review recovery without a pr number

prompts/a.md
"""


class Tests(unittest.TestCase):
    def setUp(self):
        self.rows = R.review_prs(R.parse_log(LOG))

    def test_only_squash_review_prs_and_oldest_first(self):
        self.assertEqual([r["pr"] for r in self.rows], [8421, 8488, 8489])

    def test_changed_excludes_run_records(self):
        self.assertEqual(self.rows[0]["changed"], [])
        self.assertEqual(self.rows[2]["changed"], ["prompts/routing.json", "prompts/README.md"])

    def test_clusters_by_window(self):
        self.assertEqual([len(g) for g in R.clusters(self.rows, 10)], [1, 2])
        self.assertEqual([len(g) for g in R.clusters(self.rows, 1)], [1, 2])
        self.assertEqual([len(g) for g in R.clusters(self.rows, 0.5)], [1, 1, 1])
        self.assertEqual([len(g) for g in R.clusters(self.rows, 600)], [3])

    def test_shared_files(self):
        self.assertEqual(R.shared_files(R.clusters(self.rows, 10)[1]), ["prompts/routing.json"])

    def test_timezone_offsets_are_compared_as_instants(self):
        t = R.parse_log("@@a|2026-10-19T19:00:00+00:00|s\n@@b|2026-10-19T13:00:30-06:00|t\n")
        self.assertEqual((t[1]["time"] - t[0]["time"]).total_seconds(), 30)

    def test_wilson(self):
        lo, hi = R.wilson(7, 35)
        self.assertTrue(0 < lo < 0.2 < hi < 1)
        self.assertEqual(R.wilson(0, 0), (0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
