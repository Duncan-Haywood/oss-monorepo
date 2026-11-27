"""Tests for check_yaml_cut_values.py. Run: python3 -m unittest test_check_yaml_cut_values"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_yaml_cut_values as cut  # noqa: E402
import yaml  # noqa: E402


class CutValues(unittest.TestCase):
    def test_flags_a_value_cut_by_hash_number(self):
        text = "tasks:\n  - title: Move CMMC (step 4, bet #4)\n    id: x\n"
        found = cut.cut_values(text)
        self.assertEqual([(1, 11)], [(ln, start) for ln, start, _ in found])
        self.assertEqual("Move CMMC (step 4, bet", yaml.safe_load(text)["tasks"][0]["title"])

    def test_leaves_real_comments_and_quoted_values_alone(self):
        text = ('uses: actions/checkout@abc # v4\n'
                'a: value  # a note\n'
                'b: "PR #12"\n'
                "c: 'PR #12'\n"
                'd: >-\n  folded PR #12 text\n'
                'e: PR#12 has no space\n'
                '# whole-line comment #1\n')
        self.assertEqual([], cut.cut_values(text))

    def test_fix_quotes_and_keeps_the_whole_value(self):
        text = 'name: x\ndescription: Free front door for paid bet #1 (pay "apps").\n'
        new, n = cut.fix_text(text)
        self.assertEqual(1, n)
        self.assertEqual('Free front door for paid bet #1 (pay "apps").',
                         yaml.safe_load(new)["description"])
        self.assertEqual([], cut.cut_values(new))

    def test_multi_line_plain_value_is_reported_not_fixed(self):
        text = "a: first line\n  second line #3\n"
        self.assertEqual([(1, -1)], [(ln, s) for ln, s, _ in cut.cut_values(text)])
        self.assertEqual((text, 0), cut.fix_text(text))

    def test_unparseable_yaml_is_skipped(self):
        self.assertEqual([], cut.cut_values("a: [unclosed #1\n"))

    def test_main_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.yaml"
            bad.write_text("t: bet #2\n")
            self.assertEqual(1, cut.main([str(bad)]))
            self.assertEqual(0, cut.main(["--fix", str(bad)]))
            self.assertEqual({"t": "bet #2"}, yaml.safe_load(bad.read_text()))

    def test_the_tracked_files_are_clean(self):
        self.assertEqual(0, cut.main([]))


if __name__ == "__main__":
    unittest.main()
