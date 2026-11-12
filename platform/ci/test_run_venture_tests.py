#!/usr/bin/env python3
"""Unit tests for run_venture_tests.py, the venture test step of CI.

Run: python3 -m unittest test_run_venture_tests   (from platform/ci/)
"""
import importlib.util
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
        rvt.clear_workflow_caches()
        self.addCleanup(rvt.clear_workflow_caches)

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

    def test_a_failing_test_that_leaves_a_server_open_fails_fast(self):
        # About 40 venture server suites close their server as a test's last line,
        # so a failing assertion skips it and the open handle kept `node --test`
        # running until SUITE_TIMEOUT (red-team run 2026-11-12: einvoice-preflight's
        # server.test.mjs hung 300 s on each of four caught mutants).
        self.venture("srv", {"s.test.mjs":
            "import test from 'node:test'; import http from 'node:http';"
            "test('t', async () => { const s = http.createServer(); await new Promise((r) => s.listen(0, r));"
            " throw new Error('assertion that skips the close'); s.close(); });"})
        with mock.patch.object(rvt, "SUITE_TIMEOUT", 20):
            _, ok, out, secs = rvt.run("srv")
        self.assertFalse(ok)
        self.assertNotIn("timed out", out)
        self.assertIn("assertion that skips the close", out)
        self.assertLess(secs, 15)

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
        rvt.clear_workflow_caches()
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


    def test_slowest_table_lists_the_slowest_first(self):
        table = rvt.slowest_table({"a": 1.0, "b": 9.5, "c": 3.25}, 2)
        self.assertEqual(table.splitlines()[2:], ["| b | 9.5 |", "| c | 3.2 |"])

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

    def test_no_merge_base_says_how_to_fix_it_instead_of_a_traceback(self):
        # A shallow cloud clone shares no commit with origin/main (run record
        # 2026-11-11: CalledProcessError).
        with self.assertRaises(SystemExit) as cm:
            rvt.changed_slugs("refs/no/such-ref")
        self.assertIn("git fetch --depth=40 origin main", str(cm.exception))

    def test_an_all_zero_base_means_every_venture(self):
        # A push that creates a branch reports `before` as forty zeros.
        with mock.patch.object(rvt, "since_slugs") as since, \
                mock.patch.object(rvt, "has_tests", return_value=False), \
                mock.patch("sys.stdout"):
            rvt.main(["--since", "0" * 40, "--no-unwired"])
            rvt.main(["--since", "", "--no-unwired"])
        since.assert_not_called()

    def test_since_runs_the_checks_no_workflow_names_and_fails_on_a_red_one(self):
        # 30 of 60 check_*.py ran in no PR; #15195 put a stray </head> on main.
        import unwired_checks
        with mock.patch.object(rvt, "since_slugs", return_value=[]), \
                mock.patch.object(unwired_checks, "unwired", return_value=["check_x.py"]), \
                mock.patch.object(unwired_checks, "run_all",
                                  return_value=[("check_x.py", 1, "a.html: stray </head>")]), \
                mock.patch("builtins.print") as printed:
            self.assertEqual(rvt.main(["--since", "abc123"]), 1)
        self.assertIn("stray </head>", " ".join(str(c.args[0]) for c in printed.call_args_list))
        with mock.patch.object(rvt, "since_slugs", return_value=[]), \
                mock.patch.object(unwired_checks, "run_all") as ran, \
                mock.patch("sys.stdout"):
            self.assertEqual(rvt.main(["--since", "abc123", "--no-unwired"]), 0)
            self.assertEqual(rvt.main(["someventure-that-is-not-here"]), 0)
        ran.assert_not_called()

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
                    mock.patch.object(rvt, "run", side_effect=lambda s, *_: (order.append(s), (s, True, "", 0.0))[1]), \
                    mock.patch("sys.stdout"):
                rvt.main(["--jobs", "1", "a-small", "b-big", "c-mid"])
        self.assertEqual(order, ["b-big", "c-mid", "a-small"])


@unittest.skipUnless(importlib.util.find_spec("yaml"), "needs PyYAML (ventures-tests CI has none)")
class Elsewhere(unittest.TestCase):
    """Locally, a named venture's own-workflow Python steps run too (2026-11-12:
    photo-editing printed "skip", einvoice-preflight "ok" for Node alone)."""

    WF = ("defaults:\n  run:\n    working-directory: ventures/own\n"
          "jobs:\n  t:\n    env:\n      PYTHONPATH: src\n    steps:\n"
          "      - run: pip install pytest\n"
          "      - run: python3 -m unittest discover -s tests\n")

    venture = FakeVentures.venture

    def setUp(self):
        FakeVentures.setUp(self)
        top = tempfile.TemporaryDirectory()
        self.addCleanup(top.cleanup)
        (Path(top.name) / "ventures").symlink_to(self.root)
        patcher = mock.patch.object(rvt, "ROOT", Path(top.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.venture("own", {
            "src/ownpkg/__init__.py": "VALUE = 3\n",
            "tests/test_own.py": "import unittest\nfrom ownpkg import VALUE\n"
                                 "class T(unittest.TestCase):\n"
                                 "    def test_v(self): self.assertEqual(VALUE, 3)\n",
        })
        (self.wf / "own-ci.yml").write_text(self.WF)

    def test_the_test_step_comes_with_its_directory_and_job_env(self):
        [(argv, cwd, env, wf)] = rvt.elsewhere_commands("own")
        self.assertEqual(argv[-1], "python3 -m unittest discover -s tests")
        self.assertEqual(cwd, rvt.ROOT / "ventures/own")
        self.assertEqual(env.get("PYTHONPATH"), "src")
        self.assertEqual(wf, "own-ci.yml")

    def test_it_runs_and_passes_only_with_the_job_env(self):
        _, ok, out, _ = rvt.run("own", elsewhere=True)
        self.assertTrue(ok, out)
        self.assertIn("from .github/workflows/own-ci.yml", out)

    def test_main_runs_a_named_python_only_venture_instead_of_skipping(self):
        with mock.patch.object(rvt, "ON_ACTIONS", False), \
             mock.patch("builtins.print") as printed:
            self.assertEqual(rvt.main(["own"]), 0)
        lines = " ".join(str(c.args[0]) for c in printed.call_args_list)
        self.assertIn("ok   own", lines)
        self.assertIn("1 suites run, 0 failed", lines)

    def test_no_elsewhere_and_ci_keep_the_skip(self):
        for argv, on_actions in ((["--no-elsewhere", "own"], False), (["own"], True)):
            with mock.patch.object(rvt, "ON_ACTIONS", on_actions), \
                 mock.patch("builtins.print") as printed:
                rvt.main(argv)
            lines = " ".join(str(c.args[0]) for c in printed.call_args_list)
            self.assertIn("skip own", lines)
            self.assertIn("0 suites run", lines)

    def test_a_missing_module_retries_with_an_interpreter_that_has_it(self):
        calls = []

        def fake_run(argv, cwd, timeout, env=None):
            calls.append(env or {})
            if len(calls) == 1:
                return False, "/usr/local/bin/python3: No module named pytest"
            return True, "ok"

        with mock.patch.object(rvt, "run_one", fake_run), \
             mock.patch.object(rvt, "interpreter_with", return_value="/opt/py/bin/python3"):
            ok, out = rvt.run_elsewhere_step(["bash", "-ec", "python3 -m pytest"],
                                             rvt.ROOT, {}, 10)
        self.assertTrue(ok)
        self.assertIn("ran with /opt/py/bin/python3", out)
        shim = calls[1]["PATH"].split(":")[0]
        self.assertIn('exec "/opt/py/bin/python3"', (Path(shim) / "python3").read_text())

    def test_an_editable_install_becomes_pythonpath(self):
        (self.wf / "own-ci.yml").write_text(self.WF.replace(
            "pip install pytest", "pip install -e . pytest").replace(
            "    env:\n      PYTHONPATH: src\n", ""))
        [(_, _, env, _)] = rvt.elsewhere_commands("own")
        self.assertEqual(env["PYTHONPATH"].split(":")[0], "src")
        _, ok, out, _ = rvt.run("own", elsewhere=True)
        self.assertTrue(ok, out)

    def test_retries_ask_for_every_module_seen_missing(self):
        outs = iter([(False, "No module named numpy"), (False, "No module named pytest"),
                     (True, "ok")])
        asked = []

        def find(*mods):
            asked.append(mods)
            return "/opt/py/bin/python3"

        with mock.patch.object(rvt, "run_one", lambda *a, **k: next(outs)), \
             mock.patch.object(rvt, "interpreter_with", find):
            ok, out = rvt.run_elsewhere_step(["bash", "-ec", "python3 -m pytest"],
                                             rvt.ROOT, {}, 10)
        self.assertTrue(ok, out)
        self.assertEqual(asked, [("numpy",), ("numpy", "pytest")])

    def test_a_broken_extension_probes_the_extension_not_the_package(self):
        # `import PIL` passed on the interpreter whose Pillow would not load.
        outs = iter([(False, "ImportError: cannot import name '_imaging' from 'PIL' (x)"),
                     (True, "ok")])
        asked = []
        with mock.patch.object(rvt, "run_one", lambda *a, **k: next(outs)), \
             mock.patch.object(rvt, "interpreter_with",
                               lambda *m: asked.append(m) or "/usr/bin/python3"):
            ok, out = rvt.run_elsewhere_step(["bash", "-ec", "python3 -m unittest"],
                                             rvt.ROOT, {}, 10)
        self.assertTrue(ok, out)
        self.assertEqual(asked, [("PIL._imaging",)])
        self.assertIn("lacks PIL", out)

    def test_with_no_interpreter_it_fails_and_says_how_to_get_one(self):
        with mock.patch.object(rvt, "run_one", return_value=(False, "No module named pytest")), \
             mock.patch.object(rvt, "interpreter_with", return_value=None):
            ok, out = rvt.run_elsewhere_step(["bash", "-ec", "python3 -m pytest"],
                                             rvt.ROOT, {}, 10)
        self.assertFalse(ok)
        self.assertIn("pyenv.py pytest", out)


if __name__ == "__main__":
    unittest.main()
