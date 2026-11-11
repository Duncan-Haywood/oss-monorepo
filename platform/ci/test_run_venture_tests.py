#!/usr/bin/env python3
"""Unit tests for run_venture_tests.py, the venture test step of CI.

Run: python3 -m unittest test_run_venture_tests   (from platform/ci/)
"""
import subprocess
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
        self.wf = self.root / ".wf"
        self.wf.mkdir()
        wf = mock.patch.object(rvt, "WORKFLOWS", self.wf)
        wf.start()
        self.addCleanup(wf.stop)
        rvt.python_run_elsewhere.cache_clear()
        self.addCleanup(rvt.python_run_elsewhere.cache_clear)

    OWN_CI = ("jobs:\n  t:\n    defaults:\n      run:\n        working-directory: ventures/own\n"
              "    steps:\n      - run: pip install pytest\n      - run: python3 -m pytest -q\n")
    PY_PASS = "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.assertTrue(True)\n"

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

    def test_a_new_unguarded_object_map_lookup_fails_the_run(self):
        # inherited_keys.py: "constructor" finds Object.prototype in a plain object map
        ok = "import test from 'node:test'; test('t', () => {});"
        self.venture("lk", {"x.test.mjs": ok, "calc.mjs": "const KINDS = { a: 1 };\nexport const k = (o) => KINDS[o.kind] ?? 0;\n"})
        with mock.patch("sys.stdout") as out:
            self.assertEqual(rvt.main(["lk"]), 1)
        printed = "".join(c.args[0] for c in out.write.call_args_list if c.args)
        self.assertIn("ventures/lk/calc.mjs:2: KINDS[o.kind]", printed)
        self.venture("lk", {"calc.mjs": "const KINDS = { a: 1 };\nexport const k = (o) => Object.hasOwn(KINDS, o.kind) ? KINDS[o.kind] : 0;\n"})
        with mock.patch("sys.stdout"):
            self.assertEqual(rvt.main(["lk"]), 0)

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


    def test_python_tests_run_where_no_workflow_of_its_own_does(self):
        # stranded-branch-finder's 37 unittest cases ran in no CI before.
        self.venture("py", {
            "tool.py": "X = 1\n",
            "test_tool.py": "import unittest, tool\n"
                            "class T(unittest.TestCase):\n"
                            "    def test_x(self): self.assertEqual(tool.X, 1)\n",
        })
        with mock.patch.object(rvt, "workflows_naming", return_value={}):
            self.assertTrue(rvt.has_tests("py"))
            slug, ok, out, _ = rvt.run("py")
        self.assertTrue(ok, out)

    def test_a_failing_python_test_fails_and_both_suites_run(self):
        self.venture("mix", {
            "a.test.mjs": "import test from 'node:test'; test('t', () => {});",
            "tests/test_bad.py": "import unittest\n"
                                 "class T(unittest.TestCase):\n"
                                 "    def test_x(self): self.fail('boom')\n",
        })
        with mock.patch.object(rvt, "workflows_naming", return_value={}):
            _, ok, out, _ = rvt.run("mix")
        self.assertFalse(ok)
        self.assertIn("boom", out)
        self.assertIn("node --test", out)

    def test_python_tests_are_left_to_a_venture_s_own_workflow(self):
        self.venture("own", {"test_x.py": "raise SystemExit(1)\n"})
        (self.wf / "own-ci.yml").write_text(self.OWN_CI)
        self.assertFalse(rvt.has_tests("own"))
        self.assertIn(".github/workflows/own-ci.yml: `python3 -m pytest -q`", rvt.skip_note("own"))

    def test_a_workflow_that_only_names_the_path_does_not_cover_python(self):
        # 2026-11-10: four ventures were named by a workflow (a trigger filter,
        # a node step) that never ran their Python tests.
        self.venture("shared", {"test_a.py": self.PY_PASS})
        (self.wf / "other.yml").write_text(
            "on:\n  push:\n    paths:\n      - 'ventures/shared/**'\n"
            "jobs:\n  t:\n    steps:\n      - working-directory: research/x\n"
            "        run: python3 -m unittest discover\n")
        self.assertTrue(rvt.has_tests("shared"))
        self.assertTrue(rvt.run("shared")[1])
        (self.wf / "other.yml").write_text(
            "jobs:\n  t:\n    steps:\n      - working-directory: ventures/shared\n"
            "        run: python3 -m unittest discover\n")
        rvt.python_run_elsewhere.cache_clear()
        self.assertFalse(rvt.has_tests("shared"))

    def test_pytest_style_files_unittest_cannot_see_are_not_a_failure(self):
        self.venture("pyt", {"test_a.py": "def test_x():\n    assert False\n"})
        self.assertTrue(rvt.run("pyt")[1])

    def test_a_named_venture_without_a_suite_says_why(self):
        self.venture("own", {"test_x.py": ""})
        (self.wf / "own-ci.yml").write_text(self.OWN_CI)
        with mock.patch("sys.stdout") as out:
            self.assertEqual(rvt.main(["own", "gone"]), 0)
        printed = "".join(c.args[0] for c in out.write.call_args_list if c.args)
        self.assertIn("skip own: no *.test.mjs; its Python tests run in .github/workflows/own-ci.yml", printed)
        self.assertIn("skip gone: no such venture", printed)


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

    def test_a_venture_that_reaches_into_a_changed_one_runs_too(self):
        # open-house-plans vendors ../wall-framing-takeoff/ and checks the copy;
        # a change to the source alone turned it red on main (2026-11-11).
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            files = {
                "ventures/source/engine.mjs": "export const x = 1;\n",
                "ventures/user/vendor.mjs": 'const src = "../source/engine.mjs";\n',
                "ventures/links-only/index.html": '<a href="../source/">x</a>\n',
                "ventures/other/calc.mjs": "export const y = 2;\n",
            }
            for rel, text in files.items():
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text(text)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "add", "-A"], cwd=root, check=True)
            self.assertEqual(rvt.with_dependents(["source"], root=root), ["source", "user"])
            self.assertEqual(rvt.with_dependents(["other"], root=root), ["other"])
            self.assertEqual(rvt.with_dependents([], root=root), [])

    def test_an_all_zero_base_means_every_venture(self):
        # A push that creates a branch reports `before` as forty zeros.
        with mock.patch.object(rvt, "since_slugs") as since, \
                mock.patch.object(rvt, "has_tests", return_value=False), \
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
