"""check_main_guard_last finds tests defined after `if __name__ == "__main__":`."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_main_guard_last as cg  # noqa: E402

GUARD = 'if __name__ == "__main__":\n    unittest.main()\n'


class LateTests(unittest.TestCase):
    def test_class_after_guard_is_found(self):
        src = "import unittest\nclass A(unittest.TestCase): pass\n" + GUARD + "class B: pass\n"
        self.assertEqual(cg.late_tests(src), [(3, "B", 5)])

    def test_pytest_function_after_guard_is_found(self):
        src = GUARD + "def test_x():\n    pass\ndef helper():\n    pass\n"
        self.assertEqual(cg.late_tests(src), [(1, "test_x", 3)])

    def test_guard_last_is_clean(self):
        self.assertEqual(cg.late_tests("class A: pass\ndef test_y(): pass\n" + GUARD), [])

    def test_other_ifs_do_not_count_as_a_guard(self):
        self.assertEqual(cg.late_tests("if True:\n    pass\nclass A: pass\n"), [])

    def test_unparsable_file_is_skipped(self):
        self.assertEqual(cg.late_tests("def (:\n"), [])

    def test_script_run_really_loses_the_late_tests(self):
        # The defect itself: run as a script, a file like this reports fewer tests.
        src = ("import unittest\nclass A(unittest.TestCase):\n    def test_a(self): pass\n"
               + GUARD + "class B(unittest.TestCase):\n    def test_b(self): pass\n")
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "test_late.py"
            path.write_text(src)
            r = subprocess.run([sys.executable, str(path)], capture_output=True, text=True)
        self.assertIn("Ran 1 test", r.stderr)
        self.assertEqual(len(cg.late_tests(src)), 1)


class Main(unittest.TestCase):
    def test_flags_a_file_and_exits_1(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "test_bad.py").write_text(GUARD + "class B: pass\n")
            (Path(d) / "test_ok.py").write_text("class A: pass\n" + GUARD)
            found = cg.problems(["test_bad.py", "test_ok.py"], root=d)
        self.assertEqual(list(found), ["test_bad.py"])

    def test_repository_is_clean_apart_from_known(self):
        found = cg.problems(cg.tracked_tests())
        self.assertEqual(sorted(set(found) - cg.KNOWN), [])
        # A KNOWN entry that has been fixed must be dropped from the list.
        self.assertEqual(sorted(cg.KNOWN - set(found)), [])


if __name__ == "__main__":
    unittest.main()
