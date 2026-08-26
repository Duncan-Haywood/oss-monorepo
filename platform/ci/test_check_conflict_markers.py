"""Tests for the conflict-marker guard.

Each case is one thing the guard has to get right to be worth having: it
must catch what #1032 shipped, and it must not fire on the `=======`
that appears in ordinary prose and code.
"""
import os
import tempfile
import unittest

import check_conflict_markers as guard


class MarkersIn(unittest.TestCase):
    def scan(self, text):
        fd, path = tempfile.mkstemp(suffix=".yaml")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
            return guard.markers_in(path)
        finally:
            os.unlink(path)

    def test_finds_a_whole_conflict(self):
        # Exactly the shape #1032 left in cut-list-optimizer/VENTURE.yaml.
        text = (
            "name: cut-list-optimizer\n"
            "<<<<<<< HEAD\n"
            "description: one\n"
            "=======\n"
            "description: two\n"
            ">>>>>>> origin/main\n"
            "stage: prototype\n"
        )
        self.assertEqual(
            [(2, "<" * 7), (4, "=" * 7), (6, ">" * 7)], self.scan(text)
        )

    def test_clean_file_is_clean(self):
        self.assertEqual([], self.scan("name: a\ndescription: b\n"))

    def test_ignores_a_longer_rule(self):
        # A markdown/rST underline is a run of `=`, not a conflict marker,
        # and is much longer than seven characters in practice.
        self.assertEqual([], self.scan("Heading\n" + "=" * 30 + "\n"))

    def test_ignores_markers_that_do_not_start_a_line(self):
        self.assertEqual([], self.scan("    x >>>>>>> y\n"))

    def test_ignores_seven_equals_run_together_with_more(self):
        # `=======x` is not something git writes.
        self.assertEqual([], self.scan("=======x\n"))

    def test_catches_a_bare_marker_with_no_trailing_label(self):
        # git omits the label on the middle marker, and can on the others.
        self.assertEqual([(1, "=" * 7)], self.scan("=======\n"))


class RepositoryIsClean(unittest.TestCase):
    def test_no_markers_anywhere(self):
        """The guard's own subject: this repository, right now."""
        self.assertEqual(0, guard.main())


if __name__ == "__main__":
    unittest.main()
