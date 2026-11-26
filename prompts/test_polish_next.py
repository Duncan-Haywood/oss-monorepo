"""Tests for polish_next.py: ordering polish notes and marking taken items."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import polish_next as pn


class PolishNextTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        notes = {
            "polish-2026-11-26-zeta.md": "# Z\n\n## Still weakest, next\n\n1. zeta one\n2. zeta two\n\n## After\nx\n",
            "polish-2026-11-26-alpha.md": "# A\n\nPicked item 2 of \"Still weakest\" in\n`polish-2026-11-26-zeta.md`.\n\n## Still weakest, next\n\n1. alpha one\n",
            "polish-2026-11-25-old.md": "# O\n\nno list\n",
        }
        for name, text in notes.items():
            (self.dir / name).write_text(text)

    def tearDown(self):
        self.tmp.cleanup()

    def test_commit_order_beats_alphabetical(self):
        history = ["polish-2026-11-26-alpha.md", "polish-2026-11-26-zeta.md"]
        names = [p.name for p in pn.ordered_notes(self.dir, history)]
        self.assertEqual(names[:2], history)
        self.assertEqual(names[-1], "polish-2026-11-25-old.md")

    def test_uncommitted_note_is_newest(self):
        names = [p.name for p in pn.ordered_notes(self.dir, ["polish-2026-11-25-old.md"])]
        self.assertEqual(names[0], "polish-2026-11-26-zeta.md")

    def test_section_stops_at_next_heading(self):
        body = pn.still_weakest((self.dir / "polish-2026-11-26-zeta.md").read_text())
        self.assertIn("zeta two", body)
        self.assertNotIn("After", body)
        self.assertIsNone(pn.still_weakest("# no list\n"))

    def test_citation_across_lines_marks_item(self):
        marks = pn.taken(pn.ordered_notes(self.dir, []))
        self.assertEqual(marks, {"polish-2026-11-26-zeta.md": {2: "polish-2026-11-26-alpha.md"}})

    def test_multiple_items(self):
        p = self.dir / "polish-2026-11-27-b.md"
        p.write_text('Picked items 1 and 3 of "Still weakest" in `docs/reports/polish-2026-11-26-alpha.md`.')
        marks = pn.taken([p])
        self.assertEqual(sorted(marks["polish-2026-11-26-alpha.md"]), [1, 3])


if __name__ == "__main__":
    unittest.main()
