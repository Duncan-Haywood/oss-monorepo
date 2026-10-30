"""Tests for ideas.py: reading dictated ideas and moving one to Picked up."""

from __future__ import annotations

import unittest

import ideas

INBOX = """# Ideas inbox

intro

## New

<!-- Write below this line. -->

a tool for roofers that
prices the dumpster

- second idea, as a bullet

## Picked up

<!-- log -->
"""


class IdeasTest(unittest.TestCase):
    def test_pending_joins_lines_and_drops_markers(self):
        self.assertEqual(ideas.pending(INBOX),
                         ["a tool for roofers that prices the dumpster", "second idea, as a bullet"])

    def test_empty_inbox(self):
        self.assertEqual(ideas.pending(ideas.INBOX.read_text()), [])
        self.assertEqual(ideas.pending("## New\n<!-- x -->\n\n## Picked up\n"), [])

    def test_take_moves_idea_with_link(self):
        out, idea = ideas.take(INBOX, 1, "https://example.test/pr/1", "2026-10-30")
        self.assertEqual(idea, "a tool for roofers that prices the dumpster")
        self.assertEqual(ideas.pending(out), ["second idea, as a bullet"])
        self.assertIn("<!-- Write below this line. -->", out)
        self.assertTrue(out.endswith("- 2026-10-30: a tool for roofers that prices the dumpster "
                                     "(https://example.test/pr/1)\n"))
        out2, _ = ideas.take(out, 1, "u2", "2026-10-31")
        self.assertEqual(ideas.pending(out2), [])
        self.assertEqual(out2.count("- 2026-10-3"), 2)

    def test_inbox_is_at_the_repository_root(self):
        self.assertEqual(ideas.INBOX, ideas.ROOT / "IDEAS.md")
        self.assertTrue(ideas.INBOX.exists())

    def test_site_ideas_keeps_recent_ideas_only(self):
        records = [
            {"id": 1, "day": "2026-09-01", "type": "idea", "message": "old"},
            {"id": 2, "day": "2026-10-20", "type": "problem", "message": "a bug"},
            {"id": 3, "day": "2026-10-21", "type": "idea", "tool": "x", "message": "new"},
        ]
        self.assertEqual([r["id"] for r in ideas.site_ideas(records, "2026-10-01")], [3])

    def test_missing_site_feedback_file_is_empty(self):
        self.assertEqual(ideas._site_records(ideas.ROOT / "no-such-file.json"), [])

    def test_take_out_of_range(self):
        with self.assertRaises(ValueError):
            ideas.take(INBOX, 3, "u", "2026-10-30")


if __name__ == "__main__":
    unittest.main()
