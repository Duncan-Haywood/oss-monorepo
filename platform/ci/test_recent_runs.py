import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import recent_runs as rr  # noqa: E402

NOW = datetime(2026, 11, 13, 4, 0, tzinfo=timezone.utc)


class RecentRunsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "docs" / "posts").mkdir(parents=True)
        (self.root / "docs" / "posts" / "2026-11-12-a.md").write_text(
            '---\ntitle: "The Cold Chain"\ndate: 2026-11-12\n---\nbody\n')
        self.runs = self.root / "runs"
        self.runs.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, **rec):
        (self.runs / name).write_text(json.dumps(rec))

    def test_filters_track_window_and_orders_newest_first(self):
        self.put("a.json", track="explore", ended="2026-11-13T01:00:00Z", outcome="success",
                 pr="https://github.com/o/r/pull/15328", task="STL tool")
        self.put("b.json", track="explore", ended="2026-11-12T20:00:00Z", pr=15200, goal="SAT bounds")
        self.put("c.json", track="explore", ended="2026-11-01T00:00:00Z", task="too old")
        self.put("d.json", track="creative", ended="2026-11-13T02:00:00Z", task="other track")
        self.put("broken.json", track="explore")
        (self.runs / "bad.json").write_text("{not json")
        rows = rr.select(rr.load(self.runs, "explore"), 7, 30, None, now=NOW, root=self.root)
        self.assertEqual([r["topic"] for r in rows], ["STL tool", "SAT bounds"])
        self.assertEqual([r["pr"] for r in rows], [15328, 15200])

    def test_topic_falls_back_to_post_title_then_notes(self):
        self.assertEqual(rr.topic({"writeups": ["docs/posts/2026-11-12-a.md"]}, self.root),
                         "post: The Cold Chain")
        self.assertEqual(rr.topic({"task": None, "notes": ["one", "two"]}, self.root), "one two")
        self.assertIn("names no task", rr.topic({}, self.root))

    def test_grep_ignores_input_and_limit_caps(self):
        for i in range(5):
            self.put(f"{i}.json", track="creative", ended=f"2026-11-12T0{i}:00:00Z",
                     task=f"story {i}", input="lamps", projects=["hearth"] if i % 2 else [])
        rows = rr.select(rr.load(self.runs, "creative"), None, 30, "lamps", now=NOW, root=self.root)
        self.assertEqual(rows, [])  # the starting message every run shares is not a match
        rows = rr.select(rr.load(self.runs, "creative"), None, 30, "HEARTH", now=NOW, root=self.root)
        self.assertEqual([r["topic"] for r in rows], ["story 3", "story 1"])
        self.assertEqual(len(rr.select(rr.load(self.runs), None, 2, None, now=NOW, root=self.root)), 2)

    def test_pr_number_shapes(self):
        self.assertEqual(rr.pr_number("https://github.com/o/r/pull/12/"), 12)
        self.assertEqual(rr.pr_number([7, 8]), 7)
        self.assertIsNone(rr.pr_number(None))
        self.assertIsNone(rr.pr_number("none"))

    def test_main_on_the_real_records(self):
        self.assertEqual(rr.main(["--track", "explore", "--days", "0", "--limit", "1", "--json"]), 0)
        self.assertEqual(rr.main(["--track", "no-such-track"]), 2)


if __name__ == "__main__":
    unittest.main()
