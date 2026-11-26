"""Tests for polish_next.py: ordering polish notes and marking taken items."""

from __future__ import annotations

import subprocess
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


class ShallowBoundaryTest(unittest.TestCase):
    """A shallow clone's boundary commit "adds" every note; those are not dated by it."""

    def test_boundary_commit_does_not_date_notes(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, clone = Path(tmp) / "src", Path(tmp) / "clone"
            env = ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"]
            git = lambda cwd, *a: subprocess.run(["git", *env, *a], cwd=cwd, check=True, capture_output=True, text=True)
            src.mkdir()
            git(src, "init", "-q", "-b", "main")
            (src / "docs" / "reports").mkdir(parents=True)
            for name in ("polish-2026-11-01-a.md", "polish-2026-11-02-b.md", "polish-2026-11-03-c.md"):
                (src / "docs" / "reports" / name).write_text("x\n")
                git(src, "add", ".")
                git(src, "commit", "-q", "-m", name)
            git(Path(tmp), "clone", "-q", "--depth=2", f"file://{src}", str(clone))
            self.assertTrue(pn.shallow_commits(clone))
            # c and b are real adds; the boundary commit (b) would otherwise also "add" a
            self.assertEqual(pn.commit_order(clone), ["polish-2026-11-03-c.md"])
            self.assertEqual(pn.shallow_commits(src), set())
            self.assertEqual(pn.commit_order(src), ["polish-2026-11-03-c.md", "polish-2026-11-02-b.md", "polish-2026-11-01-a.md"])


if __name__ == "__main__":
    unittest.main()
