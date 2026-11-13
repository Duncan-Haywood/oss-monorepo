import sys
import tempfile
import unittest
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

    def test_unwired_tests_match_by_file_or_module_name(self):
        with tempfile.TemporaryDirectory() as d:
            here, wf = Path(d) / "ci", Path(d) / "wf"
            here.mkdir(); wf.mkdir()
            for n in ("test_a.py", "test_b.py", "test_c.py", "test_ab_more.py"):
                (here / n).write_text("")
            (wf / "x.yml").write_text("run: python3 -m unittest test_a\nrun: pytest test_c.py\n")
            self.assertEqual([p.name for p in u.unwired_tests(here, wf)],
                             ["test_ab_more.py", "test_b.py"])

    def test_extra_drops_out_once_a_workflow_names_it(self):
        with tempfile.TemporaryDirectory() as d:
            here, wf = Path(d) / "ci", Path(d) / "wf"
            here.mkdir(); wf.mkdir()
            (wf / "x.yml").write_text("run: echo\n")
            self.assertEqual(u.unwired_extra(here, wf), [(here / "doc_index.py", "check")])
            (wf / "x.yml").write_text("run: python3 platform/ci/doc_index.py check\n")
            self.assertEqual(u.unwired_extra(here, wf), [])

    def test_a_red_unit_test_is_reported_with_its_unittest_command(self):
        with tempfile.TemporaryDirectory() as d:
            t = Path(d) / "test_red.py"
            t.write_text("import unittest\nclass T(unittest.TestCase):\n"
                         "    def test_x(self): self.assertEqual(1, 2)\n")
            (Path(d) / "test_green.py").write_text(
                "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): pass\n")
            results = u.run_all([t, Path(d) / "test_green.py"])
            self.assertEqual([(n, rc != 0) for n, rc, _ in results],
                             [("test_green.py", False), ("test_red.py", True)])
            self.assertIn("python3 -m unittest test_red", u.report(results))

    def test_checks_only_leaves_tests_and_extra_out(self):
        names = {j[0].name for j in u.jobs(checks_only=True)}
        self.assertTrue(names and all(n.startswith("check_") for n in names))
        everything = {j[0].name for j in u.jobs()}
        self.assertIn("doc_index.py", everything)
        self.assertNotIn("test_run_venture_tests.py", everything)  # ventures-tests.yml runs it


if __name__ == "__main__":
    unittest.main()
