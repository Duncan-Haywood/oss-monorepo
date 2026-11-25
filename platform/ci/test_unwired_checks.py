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

    def test_a_check_that_reads_the_built_site_is_left_out(self):
        # check_orphan_pages.py walks _site/: with none it passed vacuously,
        # and with a leftover local build it failed a sweep CI never fails.
        self.assertNotIn("check_orphan_pages.py", [p.name for p in u.unwired()])

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
                    mock.patch.object(u, "run_mixed", return_value=results), \
                    redirect_stdout(io.StringIO()) as out:
                rc = u.main([])
            self.assertEqual(rc, 0 if case == "green" else 1, case)
            passed = sum(r[1] == 0 for r in results)
            self.assertIn(f"{passed}/{len(results)} unwired", out.getvalue())

    def test_run_everything_runs_every_kind_in_one_pool_with_its_own_runner(self):
        """One pool for checks, suites, node suites and EXTRA (2026-11-14); each
        item keeps its runner, and a timeout is re-run alone with that runner."""
        seen = []
        calls = {"n": 0}

        def check(p):
            seen.append(("check", p))
            return p, 0, ""

        def suite(p):
            calls["n"] += 1
            seen.append(("suite", p))
            # The first call times out; the solo re-run passes.
            return p, (u.main_health.TIMED_OUT if calls["n"] == 1 else 0), ""

        def node(p):
            seen.append(("node", p))
            return p, 0, ""

        with mock.patch.object(u, "unwired", return_value=["check_a.py"]), \
                mock.patch.object(u, "unwired_tests", return_value=["test_b.py"]), \
                mock.patch.object(u, "unwired_portfolio_tests", return_value=["portfolio/d/test_d.py"]), \
                mock.patch.object(u, "unwired_node_suites", return_value=["c.test.mjs"]), \
                mock.patch.object(u, "unwired_extra", return_value=[]), \
                mock.patch.object(u.main_health, "label", side_effect=lambda p: p), \
                mock.patch.object(u.main_health, "run", side_effect=check), \
                mock.patch.object(u, "run_suite", side_effect=suite), \
                mock.patch.object(u, "run_node_suite", side_effect=node), \
                redirect_stdout(io.StringIO()):
            results = u.run_everything()
        self.assertEqual([r[:2] for r in results],
                         [("c.test.mjs", 0), ("check_a.py", 0), ("portfolio/d/test_d.py", 0),
                          ("test_b.py", 0)])
        self.assertEqual(seen.count(("suite", "test_b.py")), 2)
        self.assertIn(("check", "check_a.py"), seen)
        self.assertIn(("node", "c.test.mjs"), seen)
        with mock.patch.object(u, "unwired", return_value=["check_a.py"]), \
                mock.patch.object(u.main_health, "run", side_effect=check), \
                mock.patch.object(u, "unwired_tests") as tests:
            self.assertEqual([r[0] for r in u.run_everything(checks_only=True)], ["check_a.py"])
        tests.assert_not_called()

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
            if u.pytest_python():
                self.assertNotEqual(rc, 0)
            else:
                self.assertTrue(out.startswith(u.SKIPPED))


    def test_a_plain_suite_runs_under_another_python_that_has_pytest(self):
        # 2026-11-17: this python3 lacked pytest, /usr/bin/python3.x had it,
        # and every plain suite showed as a skip.
        u.pytest_python.cache_clear()
        try:
            with mock.patch.object(u, "has_module", side_effect=lambda n, py=sys.executable: py == "/other/python3"), \
                    mock.patch("pyenv.candidates", return_value=[sys.executable, "/other/python3"]):
                self.assertEqual(u.pytest_python(), "/other/python3")
            with mock.patch.object(u, "has_module", return_value=False), \
                    mock.patch("pyenv.candidates", return_value=[sys.executable]):
                u.pytest_python.cache_clear()
                self.assertIsNone(u.pytest_python())
        finally:
            u.pytest_python.cache_clear()

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
        self.assertNotIn("platform/pages/home.test.mjs", names)  # priv-portfolio-pages.yml runs it

    def test_underscore_named_node_suites_count(self):
        """2026-11-17: the six platform/ci/test_check_*.mjs suites matched no
        workflow and not the `*.test.mjs` glob, so no pull request ran them."""
        with tempfile.TemporaryDirectory() as d:
            root, wf = Path(d), Path(d) / "wf"
            wf.mkdir()
            (root / "platform/ci").mkdir(parents=True)
            for f in ("test_check_a.mjs", "test_check_b.mjs", "check_a.mjs", "test_x.py"):
                (root / "platform/ci" / f).write_text("")
            (wf / "t.yml").write_text(
                "jobs:\n  t:\n    steps:\n      - run: node --test platform/ci/test_check_b.mjs\n")
            names = [u.node_name(p, root) for p in u.unwired_node_suites(root, wf)]
            self.assertEqual(names, ["platform/ci/test_check_a.mjs"])
        self.assertIn("platform/ci/test_check_enter_reload.mjs",
                      [u.node_name(p) for p in u.unwired_node_suites()])
        self.assertIn("cd platform/ci && node --test test_check_a.mjs",
                      u.report([("platform/ci/test_check_a.mjs", 1, "boom")]))

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

    def test_a_declared_but_uninstalled_npm_package_is_a_skip_not_a_red(self):
        # platform/aws/stacks/saas-starter (PR 18765) imports @aws-sdk/client-s3
        # from its own package.json; no workflow runs npm ci there, so every
        # venture PR's changed-ventures job went red on main's code.
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "platform/s/test").mkdir(parents=True)
            (root / "platform/s/package.json").write_text(
                '{"dependencies": {"@aws-sdk/client-s3": "3.0.0"}}')
            (root / "platform/s/test/n.test.mjs").write_text(
                "import { test } from 'node:test';\nimport '@aws-sdk/client-s3';\ntest('x', () => {});\n")
            (root / "platform/s/test/t.test.mjs").write_text(
                "import { test } from 'node:test';\nimport 'not-declared-pkg';\ntest('x', () => {});\n")
            name, rc, out = u.run_node_suite(root / "platform/s/test/n.test.mjs", root=root)
            self.assertEqual(rc, 0, out)
            self.assertTrue(out.startswith(u.SKIPPED), out)
            self.assertIn("@aws-sdk/client-s3", out)
            # An import nobody declared is a real break and stays red.
            name, rc, out = u.run_node_suite(root / "platform/s/test/t.test.mjs", root=root)
            self.assertNotEqual(rc, 0)


class PortfolioSuites(unittest.TestCase):
    """portfolio/**/test_*.py that no pull-request workflow runs (2026-11-19)."""

    def wired(self, rel, workflow):
        steps = u._steps(workflow)
        return u.suite_is_wired(rel, steps)

    def test_a_module_named_from_its_own_folder_is_wired(self):
        wf = ("on:\n  pull_request:\njobs:\n  t:\n    steps:\n"
              "      - working-directory: portfolio/router\n"
              "        run: python3 -m unittest test_allocate\n")
        self.assertTrue(self.wired("portfolio/router/test_allocate.py", wf))
        self.assertFalse(self.wired("portfolio/ledger/test_allocate.py", wf))

    def test_a_longer_module_name_does_not_wire_its_prefix(self):
        # test_validate_usage named in portfolio-validate.yml hid test_validate.py.
        wf = ("on:\n  pull_request:\njobs:\n  t:\n    steps:\n"
              "      - working-directory: portfolio/router\n"
              "        run: python3 -m unittest test_validate_usage\n")
        self.assertFalse(self.wired("portfolio/router/test_validate.py", wf))

    def test_a_path_filter_alone_does_not_wire_a_suite(self):
        wf = ("on:\n  pull_request:\n    paths:\n      - portfolio/ledger/test_x.py\n"
              "jobs:\n  t:\n    steps:\n      - run: python3 other.py\n")
        # The path is in the text, so the lenient path rule counts it: a
        # workflow that filters on a suite almost always runs it.
        self.assertTrue(self.wired("portfolio/ledger/test_x.py", wf))
        self.assertFalse(self.wired("portfolio/ledger/test_y.py", wf))

    def test_a_folder_run_from_a_defaults_working_directory_wires_everything_below(self):
        wf = ("on:\n  pull_request:\ndefaults:\n  run:\n"
              "    working-directory: portfolio/pipeline/probes/p\n"
              "jobs:\n  t:\n    steps:\n      - run: pip install pytest\n"
              "      - run: python3 -m pytest -q\n")
        self.assertTrue(self.wired("portfolio/pipeline/probes/p/tests/test_a.py", wf))
        self.assertFalse(self.wired("portfolio/pipeline/probes/q/test_a.py", wf))

    def test_the_real_tree(self):
        names = [u.suite_name(p) for p in u.unwired_portfolio_tests()]
        self.assertIn("portfolio/ledger/test_no_duplicate_yaml_keys.py", names)
        self.assertIn("portfolio/router/test_validate.py", names)
        self.assertNotIn("portfolio/router/test_allocate.py", names)
        self.assertFalse([n for n in names if "/probes/mcp-drift-watch/" in n])

    def test_a_portfolio_suite_says_how_to_rerun_it(self):
        self.assertIn("cd portfolio/ledger && python3 -m pytest -q test_x.py",
                      u.reproduce("portfolio/ledger/test_x.py"))

if __name__ == "__main__":
    unittest.main()
