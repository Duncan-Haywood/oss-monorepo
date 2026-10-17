import json
import tempfile
import unittest
from pathlib import Path

import check

SAMPLE = """\
name: ci
on: push
jobs:
  plain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make
  safe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - run: make
  safe_named:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
  exported:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-artifact@v4
        with:
          path: .
  neighbour_is_safe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: o/r
          persist-credentials: false
"""


class Scan(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(SAMPLE)

    def test_lines_and_types(self):
        self.assertEqual(
            [(x["line"], x["type"]) for x in self.f],
            [
                (7, check.PERSISTS),
                (27, check.WITH_UPLOAD),
                (34, check.PERSISTS),
            ],
        )

    def test_named_step_with_false_is_clean(self):
        self.assertFalse([x for x in self.f if "safe_named" in x["detail"]])

    def test_expression_value_is_trusted(self):
        t = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: ${{ inputs.p }}\n"
        self.assertEqual(check.scan_text(t), [])

    def test_no_jobs(self):
        self.assertEqual(check.scan_text("name: x\non: push\n"), [])

    def test_cache_counts_as_export(self):
        t = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n"
        self.assertEqual(check.scan_text(t)[0]["type"], check.WITH_UPLOAD)

    def test_push_job_is_noted_not_dropped(self):
        t = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n      - run: |\n          git commit -m x\n          git push origin HEAD\n"
        f = check.scan_text(t)
        self.assertEqual([x["type"] for x in f], [check.PERSISTS])
        self.assertIn("runs `git push`", f[0]["detail"])

    def test_non_push_job_has_no_push_note(self):
        t = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo pushing the button\n"
        self.assertNotIn("git push", check.scan_text(t)[0]["detail"])


class Cli(unittest.TestCase):
    def _repo(self):
        d = tempfile.TemporaryDirectory()
        w = Path(d.name) / ".github" / "workflows"
        w.mkdir(parents=True)
        (w / "ci.yml").write_text(SAMPLE)
        return d

    def test_fail_on_risk(self):
        with self._repo() as d:
            self.assertEqual(check.main([d, "--fail-on-risk", "--format", "json"]), 2)
            self.assertEqual(check.main([d]), 0)

    def test_json_output(self):
        with self._repo() as d:
            self.assertEqual(len(check.scan_path(d)), 3)
            json.dumps(check.scan_path(d))

    def test_empty_dir(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(check.scan_path(d), [])
            self.assertIn("No .github/workflows", check.render_text([], d))


if __name__ == "__main__":
    unittest.main()
