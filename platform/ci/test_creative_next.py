"""Tests for creative_next.py: the order the creative track's "longest without a piece" rule implies."""
import contextlib
import datetime as dt
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creative_next as cn  # noqa: E402


def write(root, rel, text):
    p = Path(root) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def story(shelf, day):
    return f"---\ntitle: T\nshelf: {shelf}\npublished: {day}\nsummary: s\n---\nBody\n"


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.root = Path(self.tmp.name)
        write(r, "ventures/hearth-and-horizon/stories/a.md", story("hearth-and-horizon", "2026-11-10"))
        write(r, "ventures/hearth-and-horizon/stories/b.md", story("hearth-and-horizon", "2026-11-12"))
        write(r, "ventures/hearth-and-horizon/stories/c.md", story("little-lamps", "2026-11-12"))
        write(r, "ventures/hearth-and-horizon/stories/d.md", story("for-other-minds", "2026-11-01"))
        write(r, "ventures/saints-by-candlelight/episodes/001-x.md",
              "---\nnumber: 1\npublished: 2026-11-13\nsources:\n  - published: 1999-01-01\n---\n")
        write(r, "docs/podcast/2026-10-20-p.md", "---\ndate: 2026-10-20\npost: p\n---\n")
        write(r, "docs/posts/2026-10-20-p.md", "---\ntitle: p\n---\n")
        write(r, "docs/posts/2026-10-21-q.md", "---\ntitle: q\n---\n")

    def tearDown(self):
        self.tmp.cleanup()

    def run_json(self, *extra):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            cn.main(["--root", str(self.root), "--today", "2026-11-14", "--json", *extra])
        return json.loads(buf.getvalue())

    def test_oldest_newest_piece_first(self):
        order = [r["project"] for r in self.run_json()["projects"]]
        self.assertEqual(order[0], cn.AUDIO_ONLY)  # 2026-10-20
        self.assertEqual(order[1], "For Other Minds")  # 2026-11-01

    def test_tie_goes_to_fewer_pieces_this_week(self):
        rows = self.run_json()["projects"]
        tied = [r["project"] for r in rows if r["last_date"] == "2026-11-12"]
        # Both newest on 11-12; Little Lamps has 1 this week, H&H 2.
        self.assertEqual(tied, ["Little Lamps", "Hearth & Horizon (science fiction)"])

    def test_nested_published_in_a_list_is_ignored(self):
        sbc = next(r for r in self.run_json()["projects"] if r["project"].startswith("Saints"))
        self.assertEqual((sbc["last_date"], sbc["pieces"]), ("2026-11-13", 1))

    def test_over_cap_skips_the_audio_only_project(self):
        cap = cn.AUDIO_CAP_MB
        try:
            cn.AUDIO_CAP_MB = -1  # any audio, even none, is over
            out = self.run_json()
        finally:
            cn.AUDIO_CAP_MB = cap
        self.assertFalse(out["audio_allowed"])
        self.assertEqual(out["next"], "For Other Minds")

    def test_under_cap_the_podcast_can_be_next(self):
        out = self.run_json()
        self.assertTrue(out["audio_allowed"])
        self.assertEqual(out["next"], cn.AUDIO_ONLY)

    def test_posts_without_episode(self):
        self.assertEqual(self.run_json()["posts_without_episode"], 1)

    def test_days_since(self):
        rows = cn.ranked({"X": [("2026-11-04", "x")], "Y": []}, dt.date(2026, 11, 14))
        self.assertEqual([r["days_since"] for r in rows], [None, 10])


if __name__ == "__main__":
    unittest.main()
