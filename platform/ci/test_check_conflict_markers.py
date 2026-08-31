#!/usr/bin/env python3
"""Tests for the conflict-marker guard.

The guard is only worth having if it is both sensitive (it catches the exact
shape that got past a green test suite on 2026-08-26) and quiet (a decorative
`=======` rule in a Markdown file must not fail the build, or the check gets
switched off within a week).
"""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import check_conflict_markers as guard

OPEN = "<" * 7
CLOSE = ">" * 7
BASE = "|" * 7
SPLIT = "=" * 7


class MarkersIn(unittest.TestCase):
    def write(self, name: str, text: str) -> Path:
        path = Path(self.tmp.name) / name
        path.write_text(text, encoding="utf-8")
        return path

    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_clean_file_reports_nothing(self):
        path = self.write("clean.yaml", "name: thing\ndescription: fine\n")
        self.assertEqual(guard.markers_in(path), [])

    def test_catches_the_venture_yaml_shape(self):
        """The real 2026-08-26 failure, reduced."""
        path = self.write(
            "VENTURE.yaml",
            f"name: cut-list-optimizer\n{OPEN} HEAD\ndescription: ours\n{SPLIT}\n"
            f"description: theirs\n{CLOSE} origin/main\nstage: prototype\n",
        )
        numbers = [number for number, _ in guard.markers_in(path)]
        self.assertEqual(numbers, [2, 4, 6], "open, split, and close all reported")

    def test_catches_a_diff3_base_marker(self):
        path = self.write("x.txt", f"{OPEN} HEAD\na\n{BASE} base\nb\n{SPLIT}\nc\n{CLOSE} main\n")
        self.assertTrue(any(line.startswith(BASE) for _, line in guard.markers_in(path)))

    def test_a_decorative_rule_alone_is_not_a_conflict(self):
        """A bare `=======` is legitimate Markdown. Reporting it would make the
        check noisy enough to be disabled, which is worse than not having it."""
        path = self.write("README.md", f"Heading\n{SPLIT}\n\nSome prose.\n")
        self.assertEqual(guard.markers_in(path), [])

    def test_a_split_is_reported_once_the_file_is_already_suspect(self):
        path = self.write("README.md", f"Heading\n{SPLIT}\n\n{OPEN} HEAD\nx\n{CLOSE} main\n")
        numbers = [number for number, _ in guard.markers_in(path)]
        self.assertEqual(numbers, [2, 4, 6])

    def test_a_marker_must_start_the_line(self):
        """Prose quoting a marker mid-sentence is not a conflict."""
        path = self.write("notes.md", f"Git writes `{OPEN} HEAD` into the file.\n")
        self.assertEqual(guard.markers_in(path), [])

    def test_binary_content_is_skipped_rather_than_crashing(self):
        path = Path(self.tmp.name) / "logo.png"
        path.write_bytes(b"\x89PNG\r\n\x1a\n\xff\xfe\x00\x01")
        self.assertEqual(guard.markers_in(path), [])


class Repository(unittest.TestCase):
    def test_the_repository_itself_is_clean(self):
        self.assertEqual(guard.main(), 0)


if __name__ == "__main__":
    unittest.main()
