"""Tests for creative_due.py: (cd platform/ci && python3 -m unittest test_creative_due)"""
import datetime as dt
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creative_due as due  # noqa: E402


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

    def test_main_prints_due_then_and_audio(self):
        out = io.StringIO()
        with redirect_stdout(out):
            due.main(["--root", str(self.root), "--today", "2026-11-15", "--seed", "s"])
        text = out.getvalue()
        first = due.draw(due.rank(due.shelf_dates(self.root), dt.date(2026, 11, 15)), 0, "s")[0][0]
        self.assertIn(f"due: {first} ", text)
        self.assertIn("then: ", text)
        self.assertIn("audio: 0 MB of 400 MB cap (new audio fits)", text)
        self.assertIn("post front matter: title <= 110 chars, description 60 to 160", text)

    def tied(self):
        # Four shelves all with a piece today, like 2026-11-15 (29/31/48/76 this week).
        return due.rank({"a": [dt.date(2026, 11, 15)] * 29, "b": [dt.date(2026, 11, 15)] * 31,
                         "c": [dt.date(2026, 11, 15)] * 48, "d": [dt.date(2026, 11, 15)] * 76},
                        dt.date(2026, 11, 15))

    def test_same_seed_same_order_and_every_shelf_once(self):
        rows = self.tied()
        self.assertEqual(due.draw(rows, 0, "session-x"), due.draw(rows, 0, "session-x"))
        self.assertEqual(sorted(s for s, _ in due.draw(rows, 0, "session-x")), ["a", "b", "c", "d"])
        self.assertAlmostEqual(sum(c for _, c in due.draw(rows, 0, "q")), 1.0)

    def test_tied_shelves_spread_across_sessions(self):
        # The fault this fixes: every concurrent session drew the same shelf.
        firsts = [due.draw(self.tied(), 0, f"s{i}")[0][0] for i in range(400)]
        counts = {s: firsts.count(s) for s in "abcd"}
        self.assertTrue(all(counts.values()), counts)
        self.assertLess(max(counts.values()), 200, counts)
        self.assertGreater(counts["a"], counts["d"], counts)

    def test_shelf_days_behind_almost_always_wins(self):
        rows = due.rank({"old": [dt.date(2026, 11, 10)] * 3, "new": [dt.date(2026, 11, 15)] * 20},
                        dt.date(2026, 11, 15))
        firsts = [due.draw(rows, 0, f"s{i}")[0][0] for i in range(200)]
        self.assertGreater(firsts.count("old"), 190)

    def test_audio_only_shelf_never_drawn_over_cap(self):
        rows = due.rank(due.shelf_dates(self.root), dt.date(2026, 11, 15))
        for i in range(50):
            self.assertNotIn("writing-podcast", [s for s, _ in due.draw(rows, due.AUDIO_CAP_MB, f"s{i}")])

    def test_seed_defaults_to_session_id(self):
        import os
        from unittest import mock
        with mock.patch.dict(os.environ, {"CLAUDE_CODE_SESSION_ID": "abc"}):
            self.assertEqual(due.session_seed(None), "abc")
            self.assertEqual(due.session_seed("given"), "given")


if __name__ == "__main__":
    unittest.main()
