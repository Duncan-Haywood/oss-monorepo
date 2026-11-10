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
        wf = mock.patch.object(rvt, "WORKFLOWS", self.root / ".wf")
        wf.start()
        self.addCleanup(wf.stop)
        (self.root / ".wf").mkdir()
        rvt.uncovered_python.cache_clear()
        self.addCleanup(rvt.uncovered_python.cache_clear)

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

    PY_PASS = "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.assertTrue(True)\n"
    PY_FAIL = "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.fail('no')\n"

    def test_python_tests_no_workflow_runs_are_run_here(self):
        # 2026-11-10: six ventures' Python tests had never run in CI.
        self.venture("py", {"test_a.py": self.PY_PASS, "sub/test_b.py": self.PY_FAIL})
        self.assertTrue(rvt.uncovered_python("py"))
        self.assertEqual([c[0].name for c in rvt.commands("py")], ["py", "sub"])
        slug, ok, out, _ = rvt.run("py")
        self.assertFalse(ok)
        self.assertIn("no", out)

    def test_node_and_uncovered_python_both_run(self):
        self.venture("mix", {"x.test.mjs": "import test from 'node:test'; test('t', () => {});",
                             "test_a.py": self.PY_PASS})
        self.assertEqual(len(rvt.commands("mix")), 2)
        self.assertTrue(rvt.run("mix")[1])

    def test_pytest_style_files_are_skipped_not_failed(self):
        self.venture("pyt", {"test_a.py": "def test_x():\n    assert False\n"})
        self.assertTrue(rvt.run("pyt")[1])

    def test_python_a_workflow_runs_gets_a_note_not_a_rerun(self):
        self.venture("own", {"tests/test_a.py": self.PY_FAIL})
        (self.root / ".wf" / "own-ci.yml").write_text(
            "jobs:\n  t:\n    steps:\n      - run: pip install pytest\n"
            "      - run: python3 -m pytest tests/\n")
        self.assertFalse(rvt.uncovered_python("own"))
        self.assertEqual(rvt.commands("own"), [])
        self.assertIn("own-ci.yml: `python3 -m pytest tests/`", rvt.python_test_note("own"))

    def test_a_shared_workflow_counts_only_steps_run_in_the_venture(self):
        self.venture("shared", {"test_a.py": self.PY_PASS})
        (self.root / ".wf" / "other.yml").write_text(
            "on:\n  push:\n    paths:\n      - 'ventures/shared/**'\n"
            "jobs:\n  t:\n    steps:\n      - working-directory: research/x\n"
            "        run: python3 -m unittest discover\n")
        self.assertTrue(rvt.uncovered_python("shared"))
        (self.root / ".wf" / "other.yml").write_text(
            "jobs:\n  t:\n    steps:\n      - working-directory: ventures/shared\n"
            "        run: python3 -m unittest discover\n")
        rvt.uncovered_python.cache_clear()
        self.assertFalse(rvt.uncovered_python("shared"))

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
                mock.patch.object(rvt, "uncovered_python", return_value=False), \
                mock.patch("sys.stdout"):
            rvt.main(["--since", "0" * 40])
            rvt.main(["--since", ""])
        since.assert_not_called()

    def test_the_biggest_suite_starts_first(self):
        # A fixed worker pool finishes sooner when the longest suite is not
        # the last one submitted (backlog P062 follow-up).
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for slug, size in (("a-small", 10), ("b-big", 5000), ("c-mid", 500)):
                (root / slug).mkdir()
                (root / slug / "x.test.mjs").write_text("x" * size)
            order = []
            with mock.patch.object(rvt, "VENTURES", root), \
                    mock.patch.object(rvt, "run", side_effect=lambda s: (order.append(s), (s, True, "", 0.0))[1]), \
                    mock.patch("sys.stdout"):
                rvt.main(["--jobs", "1", "a-small", "b-big", "c-mid"])
        self.assertEqual(order, ["b-big", "c-mid", "a-small"])


if __name__ == "__main__":
    unittest.main()
