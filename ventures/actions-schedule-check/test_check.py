import json
import tempfile
import unittest
from pathlib import Path

import check

SAMPLE = """\
name: nightly
on:
  schedule:
    - cron: '0 3 * * *'
    - cron: "*/2 * * * *"
    - cron: 17 3 * * 1-5   # weekdays
    - cron: '0 0 * * * *'
    - cron: '61 3 * * *'
    # - cron: '0 1 * * *'
jobs:
  a:
    runs-on: ubuntu-latest
"""


def kinds(text):
    return [(f["line"], f["type"]) for f in check.scan_text(text)]


class ScanText(unittest.TestCase):
    def test_sample(self):
        self.assertEqual(
            kinds(SAMPLE),
            [
                (4, check.CRON_TOP_OF_HOUR),
                (5, check.CRON_TOO_FREQUENT),
                (7, check.CRON_INVALID),
                (8, check.CRON_INVALID),
            ],
        )

    def test_six_fields_detail(self):
        f = check.scan_text(SAMPLE)[2]
        self.assertIn("6 field(s)", f["detail"])

    def test_out_of_range_detail(self):
        f = check.scan_text(SAMPLE)[3]
        self.assertIn("minute field '61'", f["detail"])

    def test_good_entries_pass(self):
        for expr in ("17 3 * * *", "*/5 * * * *", "5,35 */6 * * 1-5", "43 2 1 1 0"):
            self.assertEqual(check.classify_cron(expr), [], expr)

    def test_frequent_variants(self):
        for expr in ("* * * * *", "*/1 * * * *", "*/4 * * * *", "0-30/3 * * * *"):
            self.assertEqual(check.classify_cron(expr)[0][0], check.CRON_TOO_FREQUENT, expr)

    def test_hourly_other_minute_is_fine(self):
        self.assertEqual(check.classify_cron("30 * * * *"), [])

    def test_bad_step_and_empty_item(self):
        self.assertEqual(check.classify_cron("*/0 * * * *")[0][0], check.CRON_INVALID)
        self.assertEqual(check.classify_cron("1,,2 * * * *")[0][0], check.CRON_INVALID)

    def test_comment_line_ignored(self):
        self.assertEqual(kinds("    # - cron: '* * * * *'\n"), [])


class Cli(unittest.TestCase):
    def _repo(self):
        d = tempfile.TemporaryDirectory()
        wf = Path(d.name) / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "n.yml").write_text(SAMPLE)
        return d

    def test_json_and_fail_on_risk(self):
        with self._repo() as d:
            self.assertEqual(check.main([d, "--format", "json"]), 0)
            self.assertEqual(check.main([d, "--fail-on-risk"]), 2)
            self.assertEqual(len(check.scan_path(d)), 4)

    def test_no_workflows(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIn("No .github/workflows", check.render_text([], d))


if __name__ == "__main__":
    unittest.main()
