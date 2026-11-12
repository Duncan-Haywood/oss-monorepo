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


if __name__ == "__main__":
    unittest.main()
