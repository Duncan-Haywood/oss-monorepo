"""check_uncollected_tests.py: module-level test functions in a venture run under unittest are flagged."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_uncollected_tests as cut  # noqa: E402
import run_venture_tests as rvt  # noqa: E402


BARE = "def test_one():\n    assert True\n\n\nasync def test_two():\n    pass\n"
CASE = "import unittest\n\n\nclass T(unittest.TestCase):\n    def test_x(self):\n        pass\n"


class UncollectedTestsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for slug, name, text in [("bare", "tests/test_a.py", BARE),
                                 ("bare", "tests/test_b.py", CASE),
                                 ("cased", "test_c.py", CASE),
                                 ("pytested", "test_d.py", BARE),
                                 ("suffix", "lib/d_test.py", BARE),
                                 ("broken", "test_e.py", "def test_(:\n")]:
            p = self.root / slug / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        steps = {"pytested": [("pytested-ci.yml", "python -m pytest -q")],
                 "bare": [("bare-ci.yml", "python -m unittest discover -s tests")]}
        patches = [mock.patch.object(rvt, "VENTURES", self.root),
                   mock.patch.object(rvt, "python_run_elsewhere", lambda s: steps.get(s, []))]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_flags_bare_functions_only_where_unittest_runs_them(self):
        found = {str(p.relative_to(self.root)): names for p, names in cut.hits(self.root)}
        self.assertEqual(found, {"bare/tests/test_a.py": ["test_one", "test_two"],
                                 "suffix/lib/d_test.py": ["test_one", "test_two"]})

    def test_runner_reads_the_workflow_steps(self):
        self.assertEqual(cut.runner("pytested"), "pytest")
        self.assertEqual(cut.runner("bare"), "unittest")
        self.assertEqual(cut.runner("cased"), "unittest")  # run_venture_tests' own discover

    def test_unparsable_file_is_not_a_hit(self):
        self.assertEqual(cut.bare_tests(self.root / "broken" / "test_e.py"), [])



class GuardedTestsTest(unittest.TestCase):
    def test_flags_tests_under_the_main_guard_only(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "test_g.py"
            p.write_text(CASE + "\n\nif HAVE_X:\n    class U(unittest.TestCase):\n"
                         "        def test_ok(self):\n            pass\n"
                         "\n\nif __name__ == \"__main__\":\n    unittest.main()\n\n"
                         "    def test_dead(self):\n        pass\n")
            self.assertEqual(cut.guarded_tests(p), ["test_dead"])
            (Path(d) / "test_bad.py").write_text("def test_(:\n")
            self.assertEqual(cut.guarded_tests(Path(d) / "test_bad.py"), [])


if __name__ == "__main__":
    unittest.main()
