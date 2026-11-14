import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import unwired_checks as u


class Unwired(unittest.TestCase):
    def test_a_check_no_workflow_names_is_found_and_a_named_one_is_not(self):
        with tempfile.TemporaryDirectory() as d:
            here, wf = Path(d) / "ci", Path(d) / "wf"
            here.mkdir(); wf.mkdir()
            for n in ("check_a.py", "check_b.py", "check_pages_links.py", "other.py"):
                (here / n).write_text("")
            (wf / "x.yml").write_text("run: python3 platform/ci/check_a.py\n")
            self.assertEqual([p.name for p in u.unwired(here, wf)], ["check_b.py"])

    def test_report_names_each_red_check_and_how_to_rerun_it(self):
        text = u.report([("check_ok.py", 0, ""), ("check_bad.py", 1, "x.html: stray </head>")])
        self.assertIn("check_bad.py", text)
        self.assertIn("python3 platform/ci/check_bad.py", text)
        self.assertNotIn("check_ok.py", text)
        self.assertEqual(u.report([("check_ok.py", 0, "")]), "")

    def test_the_real_tree_has_checks_and_none_needs_a_site(self):
        names = [p.name for p in u.unwired()]
        self.assertNotIn("check_pages_links.py", names)
        self.assertNotIn("check_markup_basics.py", names)  # portfolio-validate.yml runs it

    def test_main_exits_1_when_any_is_red_and_0_when_all_pass(self):
        """The exit code is the whole contract run_venture_tests.py and CI read."""
        cases = {
            "red": [("check_ok.py", 0, ""), ("test_bad.py", 1, "FAILED")],
            "green": [("check_ok.py", 0, ""), ("test_ok.py", 0, "OK")],
            "both-red": [("check_a.py", 1, "x"), ("test_b.py", 1, "y")],
        }
        for case, results in cases.items():
            with self.subTest(case), \
                    mock.patch.object(u, "unwired", return_value=[]), \
                    mock.patch.object(u, "unwired_tests", return_value=[]), \
                    mock.patch.object(u, "unwired_extra", return_value=[]), \
                    mock.patch.object(u, "unwired_node_suites", return_value=[]), \
                    mock.patch.object(u, "run_all", side_effect=[results, [], [], []]), \
                    redirect_stdout(io.StringIO()) as out:
                rc = u.main([])
            self.assertEqual(rc, 0 if case == "green" else 1, case)
            passed = sum(r[1] == 0 for r in results)
            self.assertIn(f"{passed}/{len(results)} unwired", out.getvalue())

    def test_report_keeps_the_last_eight_lines_of_a_red_output(self):
        out = "\n".join(f"line{i}" for i in range(20))
        text = u.report([("check_bad.py", 1, out)])
        self.assertIn("line12", text)
        self.assertNotIn("line11", text)

    def test_help_describes_the_tool(self):
        with redirect_stdout(io.StringIO()) as out, self.assertRaises(SystemExit):
            u.main(["--help"])
        self.assertIn(u.__doc__.split("\n")[0], out.getvalue())

    def test_a_red_suite_says_how_to_rerun_it_with_unittest(self):
        text = u.report([("test_doc_index.py", 1, "FAILED (failures=1)")])
        self.assertIn("cd platform/ci && python3 -m unittest test_doc_index", text)


class PullRequestTrigger(unittest.TestCase):
    def test_only_the_on_block_counts(self):
        nightly = (
            "# deliberately no `pull_request` trigger\n"
            "on:\n  schedule:\n    - cron: '0 4 * * *'\n  workflow_dispatch:\n"
            "jobs:\n  x:\n    runs-on: ${{ github.event.pull_request.head.repo.fork && 'a' || 'b' }}\n"
        )
        self.assertFalse(u.triggers_on_pull_request(nightly))
        for text in (
            "on:\n  pull_request:\n    paths: [x]\njobs: {}\n",
            "on:\n  push:\n  pull_request_target:\njobs: {}\n",
            "on: [push, pull_request]\njobs: {}\n",
            "on: pull_request\n",
            '"on":\n  pull_request:\n',
            "on:\n  # a comment line\n  pull_request:\n",
        ):
            with self.subTest(text):
                self.assertTrue(u.triggers_on_pull_request(text))
        self.assertFalse(u.triggers_on_pull_request("on:\n  push:\n# pull_request later\njobs: {}\n"))

    def test_a_suite_named_only_by_a_nightly_is_unwired(self):
        with tempfile.TemporaryDirectory() as d:
            here, wf = Path(d) / "ci", Path(d) / "wf"
            here.mkdir(); wf.mkdir()
            for n in ("test_pr.py", "test_nightly.py", "test_none.py", "check_x.py"):
                (here / n).write_text("")
            (wf / "pr.yml").write_text("on:\n  pull_request:\njobs:\n  t:\n    steps:\n"
                                       "      - run: python3 -m unittest test_pr\n")
            (wf / "night.yml").write_text("on:\n  schedule:\n    - cron: '0 4 * * *'\n"
                                          "jobs:\n  t:\n    steps:\n"
                                          "      - run: python3 -m unittest test_nightly\n")
            self.assertEqual([p.name for p in u.unwired_tests(here, wf)],
                             ["test_nightly.py", "test_none.py"])

    def test_run_suite_reports_a_red_and_a_green_module(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "helper_mod.py").write_text("X = 1\n")
            (Path(d) / "test_green.py").write_text(
                "import unittest, helper_mod\n"
                "class T(unittest.TestCase):\n    def test_x(self): self.assertEqual(helper_mod.X, 1)\n")
            (Path(d) / "test_red.py").write_text(
                "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.fail('boom')\n")
            self.assertEqual(u.run_suite(Path(d) / "test_green.py")[:2], ("test_green.py", 0))
            name, rc, out = u.run_suite(Path(d) / "test_red.py")
            self.assertEqual((name, rc), ("test_red.py", 1))
            self.assertIn("boom", out)

    def test_the_real_tree_has_no_nightly_only_suite_counted_as_wired(self):
        self.assertIn("test_browser_checks.py", [p.name for p in u.unwired_tests()])


    def test_extra_drops_out_once_a_workflow_names_it(self):
        with tempfile.TemporaryDirectory() as d:
            here, wf = Path(d) / "ci", Path(d) / "wf"
            here.mkdir(); wf.mkdir()
            (wf / "x.yml").write_text("run: echo\n")
            self.assertEqual(u.unwired_extra(here, wf), [(here / "doc_index.py", "check")])
            (wf / "x.yml").write_text("run: python3 platform/ci/doc_index.py check\n")
            self.assertEqual(u.unwired_extra(here, wf), [])
        self.assertEqual(u.reproduce("doc_index.py"), "python3 platform/ci/doc_index.py check")

    def test_a_missing_package_is_a_skip_but_a_missing_sibling_is_a_failure(self):
        # The CI runner has no yaml: test_soc2_controls and test_doctrine_review.
        with tempfile.TemporaryDirectory() as d:
            here = Path(d)
            (here / "localmod.py").write_text("")
            self.assertEqual(u.missing_module("ModuleNotFoundError: No module named 'yaml'", here), "yaml")
            self.assertIsNone(u.missing_module("ModuleNotFoundError: No module named 'localmod'", here))
            self.assertIsNone(u.missing_module("AssertionError", here))
            t = here / "test_needs.py"
            t.write_text("import unittest\nimport no_such_pkg_xyz\nclass T(unittest.TestCase):\n"
                         "    def test_x(self): pass\n")
            name, rc, out = u.run_suite(t)
            self.assertEqual(rc, 0)
            self.assertEqual(u.skipped([(name, rc, out)]), [(name, out)])

    def test_a_plain_function_suite_never_passes_as_zero_unittest_tests(self):
        # Python 3.11 calls 0 unittest tests OK; 3.12 exits 5. Neither is a pass.
        with tempfile.TemporaryDirectory() as d:
            t = Path(d) / "test_plain.py"
            t.write_text("def test_x():\n    assert 1 == 2\n")
            name, rc, out = u.run_suite(t)
            if u.has_module("pytest"):
                self.assertNotEqual(rc, 0)
            else:
                self.assertTrue(out.startswith(u.SKIPPED))



    def test_node_suites_resolve_globs_from_the_steps_working_directory(self):
        """2026-11-14: platform/proposal/term-ids.test.mjs was red on main and
        platform/devlog's suite let 4 of 8 mutants through, because no workflow
        ran either. A suite counts as run only if a `node --test` argument,
        globbed from its step's directory, reaches it."""
        with tempfile.TemporaryDirectory() as d:
            root, wf = Path(d), Path(d) / "wf"
            wf.mkdir()
            for f in ("pages/a.test.mjs", "pages/cf/b.test.mjs", "dist/x.test.mjs",
                      "dist/y.test.mjs", "edge/e.test.mjs", "lone/l.test.mjs"):
                (root / "platform" / f).parent.mkdir(parents=True, exist_ok=True)
                (root / "platform" / f).write_text("")
            (root / "platform/lone/node_modules").mkdir()
            (root / "platform/lone/node_modules/dep.test.mjs").write_text("")
            (wf / "deploy.yml").write_text(
                "on:\n  push:\njobs:\n  t:\n    steps:\n"
                "      - name: site\n        run: node --test \"*.test.mjs\" \"cf/*.test.mjs\"\n"
                "        working-directory: platform/pages\n"
                "      - run: node --test platform/dist/x.test.mjs\n"
                "      - run: |\n          cd platform/edge && node --test e.test.mjs\n")
            names = [u.node_name(p, root) for p in u.unwired_node_suites(root, wf)]
            self.assertEqual(names, ["platform/dist/y.test.mjs", "platform/lone/l.test.mjs"])

    def test_the_real_tree_runs_the_devlog_and_proposal_suites_here(self):
        names = [u.node_name(p) for p in u.unwired_node_suites()]
        self.assertIn("platform/devlog/devlog.test.mjs", names)
        self.assertIn("platform/proposal/term-ids.test.mjs", names)
        self.assertNotIn("platform/pages/home.test.mjs", names)  # portfolio-pages.yml runs it

    def test_run_node_suite_reports_red_green_and_a_named_slow_skip(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform/s").mkdir(parents=True)
            (root / "platform/s/g.test.mjs").write_text(
                "import { test } from 'node:test';\ntest('ok', () => {});\n")
            (root / "platform/s/r.test.mjs").write_text(
                "import { test } from 'node:test';\ntest('no', () => { throw new Error('boom'); });\n")
            self.assertEqual(u.run_node_suite(root / "platform/s/g.test.mjs", root=root)[:2],
                             ("platform/s/g.test.mjs", 0))
            name, rc, out = u.run_node_suite(root / "platform/s/r.test.mjs", root=root)
            self.assertEqual((name, rc), ("platform/s/r.test.mjs", 1))
            self.assertIn("boom", out)
            with mock.patch.dict(u.NODE_SLOW, {"platform/s/r.test.mjs": "slow"}):
                name, rc, out = u.run_node_suite(root / "platform/s/r.test.mjs", root=root)
            self.assertEqual(rc, 0)
            self.assertTrue(out.startswith(u.SKIPPED))
        self.assertIn("cd platform/s && node --test r.test.mjs",
                      u.report([("platform/s/r.test.mjs", 1, "boom")]))

if __name__ == "__main__":
    unittest.main()
