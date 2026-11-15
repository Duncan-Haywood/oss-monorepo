"""Tests for due.py: python3 -m unittest discover -s platform/creative"""
import datetime as dt
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import due  # noqa: E402


def write(root, rel, text):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


class DueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        hh = "ventures/hearth-and-horizon/stories"
        write(self.root, f"{hh}/a.md", "---\ntitle: A\nshelf: hearth-and-horizon\npublished: 2026-11-15\n---\nx\n")
        write(self.root, f"{hh}/b.md", "---\ntitle: B\nshelf: hearth-and-horizon\npublished: 2026-11-14\n---\nx\n")
        write(self.root, f"{hh}/c.md", "---\ntitle: C\nshelf: little-lamps\npublished: 2026-11-15\n---\nx\n")
        write(self.root, f"{hh}/d.md", "---\ntitle: D\nshelf: for-other-minds\npublished: 2026-11-10\n---\nx\n")
        write(self.root, f"{hh}/bad.md", "no front matter\n")
        write(self.root, "ventures/saints-by-candlelight/episodes/001-x.md",
              "---\nnumber: 1\npublished: \"2026-11-15\"\n---\nx\n")
        write(self.root, "docs/podcast/2026-11-01-p.md", "---\ntitle: P\ndate: 2026-11-01\n---\nx\n")

    def tearDown(self):
        self.tmp.cleanup()

    def test_dates_by_shelf_field(self):
        d = due.shelf_dates(self.root)
        self.assertEqual(len(d["hearth-and-horizon"]), 2)
        self.assertEqual(d["saints-by-candlelight"], [dt.date(2026, 11, 15)])
        self.assertEqual(d["writing-podcast"], [dt.date(2026, 11, 1)])

    def test_rank_oldest_first_then_fewest_this_week(self):
        rows = due.rank(due.shelf_dates(self.root), dt.date(2026, 11, 15))
        self.assertEqual([r["shelf"] for r in rows],
                         ["writing-podcast", "for-other-minds", "little-lamps",
                          "saints-by-candlelight", "hearth-and-horizon"])
        self.assertEqual(rows[1]["days_since"], 5)

    def test_audio_only_shelf_skipped_over_cap(self):
        rows = due.rank(due.shelf_dates(self.root), dt.date(2026, 11, 15))
        self.assertEqual(due.due_shelf(rows, due.AUDIO_CAP_MB), "for-other-minds")
        self.assertEqual(due.due_shelf(rows, due.AUDIO_CAP_MB - 1), "writing-podcast")

    def test_empty_shelf_is_most_due(self):
        rows = due.rank({"x": [], "y": [dt.date(2026, 1, 1)]}, dt.date(2026, 11, 15))
        self.assertEqual(rows[0]["shelf"], "x")

    def test_main_prints_due_and_audio(self):
        out = io.StringIO()
        with redirect_stdout(out):
            due.main(["--root", str(self.root), "--today", "2026-11-15"])
        text = out.getvalue()
        self.assertIn("due: writing-podcast", text)
        self.assertIn("audio: 0 MB of 400 MB cap (new audio fits)", text)


if __name__ == "__main__":
    unittest.main()
