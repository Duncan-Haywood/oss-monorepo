import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check

SAMPLE = """\
name: ci
on: push
jobs:
  lint:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - run: x
  test:
    runs-on: ubuntu-latest
    steps:
      - run: x
      - name: upload
        uses: actions/upload-artifact@v4
        continue-on-error: true
      - continue-on-error: true
        run: y
  exp:
    runs-on: ubuntu-latest
    continue-on-error: ${{ matrix.experimental }}
    steps:
      - run: x
  off:
    runs-on: ubuntu-latest
    continue-on-error: false
    steps:
      - run: x
        continue-on-error: false
"""


class ScanText(unittest.TestCase):
    def test_job_level(self):
        f = [x for x in check.scan_text(SAMPLE) if x["type"] == check.JOB_COE]
        self.assertEqual([x["line"] for x in f], [6])
        self.assertIn("job 'lint'", f[0]["detail"])

    def test_step_level_including_list_item_key(self):
        f = [x for x in check.scan_text(SAMPLE) if x["type"] == check.STEP_COE]
        self.assertEqual([x["line"] for x in f], [15, 16])
        self.assertIn("job 'test'", f[0]["detail"])

    def test_expression_and_false_not_flagged(self):
        lines = {x["line"] for x in check.scan_text(SAMPLE)}
        self.assertFalse(lines & {20, 26, 30})

    def test_quoted_and_commented_true(self):
        t = "on: push\njobs:\n  a:\n    runs-on: x\n    continue-on-error: 'true' # ok\n"
        self.assertEqual(len(check.scan_text(t)), 1)

    def test_no_jobs(self):
        self.assertEqual(check.scan_text("on: push\n"), [])


class Cli(unittest.TestCase):
    def _repo(self, text):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        wf = Path(d.name) / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "ci.yml").write_text(text)
        return d.name

    def test_exit_codes(self):
        root = self._repo(SAMPLE)
        self.assertEqual(check.main([root]), 0)
        self.assertEqual(check.main([root, "--fail-on-risk"]), 2)

    def test_clean(self):
        root = self._repo("on: push\njobs:\n  a:\n    runs-on: x\n")
        self.assertEqual(check.main([root, "--fail-on-risk"]), 0)

    def test_json(self):
        root = self._repo(SAMPLE)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        self.assertEqual(len(json.loads(buf.getvalue())), 3)


if __name__ == "__main__":
    unittest.main()
