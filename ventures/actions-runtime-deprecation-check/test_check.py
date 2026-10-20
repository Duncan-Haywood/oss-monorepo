import json
import tempfile
import unittest
from pathlib import Path

import check

SAMPLE = """\
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/upload-artifact@v3
      - uses: actions/cache@v5
      # - uses: actions/checkout@v2
      - uses: actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab
      - uses: actions/checkout@main
      - uses: some-org/thing@v1
      - uses: "actions/setup-python@v4.7.0"
      - uses: actions/cache/restore@v2
"""


class Scan(unittest.TestCase):
    def kinds(self):
        return [(f["line"], f["type"]) for f in check.scan_text(SAMPLE)]

    def test_classification_by_line(self):
        self.assertEqual(
            self.kinds(),
            [
                (5, check.DEPRECATED_RUNTIME),
                (6, check.AGEING_RUNTIME),
                (9, check.SHUT_DOWN_VERSION),
                (15, check.DEPRECATED_RUNTIME),
                (16, check.SHUT_DOWN_VERSION),
            ],
        )

    def test_skips_comments_shas_branches_and_third_party(self):
        lines = {f["line"] for f in check.scan_text(SAMPLE)}
        self.assertFalse(lines & {10, 11, 12, 13, 14})

    def test_latest_is_clean(self):
        self.assertEqual(check.scan_text("      - uses: actions/checkout@v5\n"), [])

    def test_fix_names_latest_major(self):
        f = check.scan_text("      - uses: actions/checkout@v3\n")[0]
        self.assertIn("actions/checkout@v5", f["remediation"])

    def test_risk_excludes_ageing(self):
        ageing = check.scan_text("      - uses: actions/setup-node@v4\n")
        self.assertFalse(check.has_risk(ageing))
        self.assertTrue(check.has_risk(check.scan_text(SAMPLE)))

    def test_table_is_monotonic(self):
        for name, table in check.RUNTIMES.items():
            runtimes = [table[m] for m in sorted(table)]
            self.assertEqual(runtimes, sorted(runtimes), name)


class Cli(unittest.TestCase):
    def make_repo(self, text):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        wf = Path(d.name) / ".github" / "workflows"
        wf.mkdir(parents=True)
        (wf / "ci.yml").write_text(text)
        return d.name

    def test_exit_codes_and_json(self):
        root = self.make_repo(SAMPLE)
        self.assertEqual(check.main([root]), 0)
        self.assertEqual(check.main([root, "--fail-on-risk"]), 2)
        clean = self.make_repo("      - uses: actions/checkout@v5\n")
        self.assertEqual(check.main([clean, "--fail-on-risk"]), 0)

    def test_json_shape(self):
        root = self.make_repo(SAMPLE)
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        data = json.loads(buf.getvalue())
        self.assertEqual(len(data), 5)
        self.assertEqual(data[0]["action"], "actions/checkout@v3")

    def test_no_workflows(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.assertIn("No .github/workflows", check.render_text([], d.name))


if __name__ == "__main__":
    unittest.main()
