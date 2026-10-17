import json
import tempfile
import unittest
from pathlib import Path

import check

SAMPLE = """\
name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        timeout-minutes: 5
  mac:
    runs-on: macos-latest
    timeout-minutes: 360
    steps:
      - run: x
  ok:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: x
  call:
    uses: ./.github/workflows/r.yml
  win:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - run: x
"""


class ScanText(unittest.TestCase):
    def test_missing_timeout_ignores_step_level(self):
        f = [x for x in check.scan_text(SAMPLE) if x["type"] == check.JOB_MISSING_TIMEOUT]
        self.assertEqual([x["line"] for x in f], [4, 21])
        self.assertIn("job 'test'", f[0]["detail"])

    def test_default_restated_with_macos_multiplier(self):
        f = [x for x in check.scan_text(SAMPLE) if x["type"] == check.JOB_TIMEOUT_AT_DEFAULT]
        self.assertEqual(len(f), 1)
        self.assertEqual(f[0]["line"], 9)
        self.assertIn("3,600 billed min", f[0]["detail"])

    def test_matrix_expression_picks_up_windows(self):
        f = [x for x in check.scan_text(SAMPLE) if x["line"] == 21][0]
        self.assertIn("720 billed min", f["detail"])

    def test_ok_and_reusable_call_not_flagged(self):
        details = " ".join(x["detail"] for x in check.scan_text(SAMPLE))
        self.assertNotIn("job 'ok'", details)
        self.assertNotIn("job 'call'", details)

    def test_expression_timeout_trusted(self):
        text = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: ${{ vars.T }}\n"
        self.assertEqual(check.scan_text(text), [])

    def test_self_hosted_has_no_multiplier(self):
        text = "on: push\njobs:\n  a:\n    runs-on: [self-hosted, linux]\n    steps: []\n"
        f = check.scan_text(text)
        self.assertEqual(len(f), 1)
        self.assertIn("not metered by GitHub", f[0]["detail"])

    def test_no_jobs_mapping(self):
        self.assertEqual(check.scan_text("on: push\n"), [])


class Cli(unittest.TestCase):
    def _repo(self, text):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        wf = Path(d.name) / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "ci.yml").write_text(text)
        return d.name

    def test_fail_on_risk_exit_code(self):
        root = self._repo(SAMPLE)
        self.assertEqual(check.main([root]), 0)
        self.assertEqual(check.main([root, "--fail-on-risk"]), 2)

    def test_clean_repo_exits_zero_even_with_flag(self):
        root = self._repo("on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n")
        self.assertEqual(check.main([root, "--fail-on-risk"]), 0)

    def test_json_output(self):
        root = self._repo(SAMPLE)
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        self.assertEqual(len(json.loads(buf.getvalue())), 3)


if __name__ == "__main__":
    unittest.main()
