#!/usr/bin/env python3
"""Unit tests for run_venture_tests.py, the venture test step of CI.

Run: python3 -m unittest test_run_venture_tests   (from platform/ci/)
"""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import run_venture_tests as rvt


class FakeVentures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        patcher = mock.patch.object(rvt, "VENTURES", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def venture(self, slug, files):
        for name, body in files.items():
            path = self.root / slug / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)

    def test_a_passing_suite_runs_from_the_venture_directory(self):
        # The per-venture workflows this replaced ran `node --test` from the
        # venture's own directory, so a relative read must keep working.
        self.venture("a", {
            "data.txt": "hi",
            "x.test.mjs": "import test from 'node:test'; import fs from 'node:fs';"
                          "test('t', () => { if (fs.readFileSync('data.txt', 'utf8') !== 'hi') throw 1; });",
        })
        slug, ok, _, _ = rvt.run("a")
        self.assertEqual((slug, ok), ("a", True))

    def test_a_failing_suite_fails_the_run(self):
        self.venture("b", {"sub/y.test.mjs": "import test from 'node:test'; test('t', () => { throw new Error('no'); });"})
        self.assertTrue(rvt.has_tests("b"))
        with mock.patch("sys.stdout"):
            self.assertEqual(rvt.main(["b"]), 1)

    def test_a_hung_suite_is_killed_and_named(self):
        self.venture("c", {"z.test.mjs": "import test from 'node:test'; test('t', () => new Promise(() => setInterval(() => {}, 1000)));"})
        with mock.patch.object(rvt, "SUITE_TIMEOUT", 2):
            _, ok, out, secs = rvt.run("c")
        self.assertFalse(ok)
        self.assertIn("timed out", out)
        self.assertLess(secs, 30)

    def test_ventures_without_tests_are_skipped(self):
        self.venture("d", {"index.html": "<p>"})
        self.venture("e", {"node_modules/dep/q.test.mjs": "throw 1"})
        self.assertFalse(rvt.has_tests("d"))
        self.assertFalse(rvt.has_tests("e"))
        self.assertFalse(rvt.has_tests("gone"))


class Report(unittest.TestCase):
    def test_the_failing_test_is_shown_even_far_from_the_end(self):
        out = "\n".join(["not ok 3 - the broken one", "  error: boom"] + [f"ok {i}" for i in range(500)] + ["# fail 1"])
        shown = rvt.failures(out)
        self.assertIn("the broken one", shown)
        self.assertIn("# fail 1", shown)
        self.assertNotIn("ok 400", shown)


class Selection(unittest.TestCase):
    def test_slugs_come_from_paths_under_a_venture(self):
        self.assertEqual(
            rvt.slugs_in(["ventures/a/x.js", "ventures/a/b/y", "ventures/README.md", "docs/z", "ventures/b/i"]),
            ["a", "b"])

    def test_an_all_zero_base_means_every_venture(self):
        # A push that creates a branch reports `before` as forty zeros.
        with mock.patch.object(rvt, "since_slugs") as since, \
                mock.patch.object(rvt, "has_tests", return_value=False), \
                mock.patch("sys.stdout"):
            rvt.main(["--since", "0" * 40])
            rvt.main(["--since", ""])
        since.assert_not_called()


if __name__ == "__main__":
    unittest.main()
