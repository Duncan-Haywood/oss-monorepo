"""Tests for run_research_tests.py: selection, sampling and the retry on a missing module."""
import os
import subprocess
import tempfile
import unittest
import unittest.mock

import run_research_tests as rrt


class Done:
    def __init__(self, code=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = code, out, err


class Selection(unittest.TestCase):
    def test_project_of(self):
        self.assertEqual(rrt.project_of("research/marine-hull/tests/test_x.py"), "research/marine-hull")
        self.assertIsNone(rrt.project_of("research/_shared/pick_track.py"))
        self.assertIsNone(rrt.project_of("research/README.md"))
        self.assertIsNone(rrt.project_of("ventures/x/y.py"))

    def test_sample_is_repeatable_and_seeded(self):
        names = [f"research/p{i}" for i in range(50)]
        a = rrt.sample(names, 5, "2026-11-19")
        self.assertEqual(a, rrt.sample(list(reversed(names)), 5, "2026-11-19"))
        self.assertEqual(len(a), 5)
        self.assertNotEqual(a, rrt.sample(names, 5, "another"))


class RunOne(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        os.makedirs(os.path.join(self.tmp.name, "research", "p", "tests"))
        open(os.path.join(self.tmp.name, "research", "p", "tests", "test_a.py"), "w").close()
        os.makedirs(os.path.join(self.tmp.name, "research", "p", "experiments", "own"))
        patcher = unittest.mock.patch.object(rrt, "REPO", self.tmp.name)
        patcher.start()
        self.addCleanup(patcher.stop)

    def fake(self, pytest_results):
        calls = []

        def run(cmd, **kw):
            calls.append(cmd)
            if cmd[1] == rrt.PYENV:
                return Done(0, "/usr/bin/python3\n")
            return pytest_results.pop(0)
        return calls, run

    def test_pass(self):
        calls, run = self.fake([Done(0, "3 passed in 0.1s\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "PASS")
        self.assertEqual(r["tail"], "3 passed in 0.1s")

    def test_missing_module_is_added_and_retried(self):
        calls, run = self.fake([Done(2, "E   ModuleNotFoundError: No module named 'scipy.optimize'\n"),
                                Done(0, "1 passed\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "PASS")
        self.assertEqual(r["extra"], ["scipy"])
        pyenv_calls = [c for c in calls if c[1] == rrt.PYENV]
        self.assertEqual(pyenv_calls[-1][-1], "scipy")

    def test_unittest_only_suite_passes_by_unittest(self):
        _, run = self.fake([Done(1, "E  fixture 'h0' not found\n"),
                            Done(0, "", ".......\n----\nRan 7 tests in 1.9s\n\nOK\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "PASS")
        self.assertIn("unittest", r["tail"])

    def test_missing_gl_is_env(self):
        _, run = self.fake([Done(2, "AttributeError: 'NoneType' object has no attribute 'glGetError'\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            self.assertEqual(rrt.run_one("research/p", 60, 60)["verdict"], "ENV")

    def test_projects_own_module_is_a_failure_not_an_install(self):
        _, run = self.fake([Done(2, "No module named 'own'\n"), Done(1, "", "Ran 1 test\nFAILED\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "FAIL")
        self.assertEqual(r["extra"], [])

    def test_sibling_projects_src_goes_on_the_path(self):
        os.makedirs(os.path.join(self.tmp.name, "research", "base", "src", "base_mod"))
        seen = []
        _, run = self.fake([Done(2, "No module named 'base_mod'\n"), Done(0, "2 passed\n")])

        def spy(cmd, **kw):
            seen.append(kw.get("env", {}).get("PYTHONPATH", ""))
            return run(cmd, **kw)
        with unittest.mock.patch.object(subprocess, "run", spy):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "PASS")
        self.assertEqual(r["extra"], [])
        self.assertIn(os.path.join(self.tmp.name, "research", "base", "src"), seen[-1])

    def test_missing_program_is_env(self):
        _, run = self.fake([Done(1, "E   FileNotFoundError: [Errno 2] No such file or directory: 'yosys'\n"),
                            Done(1, "", "Ran 2 tests\nFAILED\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "ENV")
        self.assertIn("yosys", r["tail"])

    def test_no_interpreter_is_env(self):
        def run(cmd, **kw):
            return Done(1, "", "pyenv: no interpreter imports foo")
        with unittest.mock.patch.object(subprocess, "run", run):
            r = rrt.run_one("research/p", 60, 60)
        self.assertEqual(r["verdict"], "ENV")

    def test_no_tests_collected_is_none(self):
        _, run = self.fake([Done(5, "no tests ran\n")])
        with unittest.mock.patch.object(subprocess, "run", run):
            self.assertEqual(rrt.run_one("research/p", 60, 60)["verdict"], "NONE")

    def test_timeout(self):
        def run(cmd, **kw):
            if cmd[1] == rrt.PYENV:
                return Done(0, "/usr/bin/python3\n")
            raise subprocess.TimeoutExpired(cmd, 1)
        with unittest.mock.patch.object(subprocess, "run", run):
            self.assertEqual(rrt.run_one("research/p", 1, 60)["verdict"], "TIMEOUT")


if __name__ == "__main__":
    unittest.main()
