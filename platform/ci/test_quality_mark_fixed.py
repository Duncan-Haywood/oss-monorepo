"""Tests for platform/ci/quality_mark_fixed.py (quality_audit.py mark-fixed)."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import quality_mark_fixed as m  # noqa: E402

URL = "https://github.com/o/r/pull/7"
HAND = """{
 "date": "2026-11-07",
 "scores": {"correctness": 2, "craft": 3},
 "defects": [
  {
   "severity": "medium",
   "what": "a, \\"quoted\\" thing: {not a brace}"
  },
  {"severity": "low", "what": "one-line defect"}
 ],
 "fix_prs": ["https://github.com/o/r/pull/1"],
 "verdict": "ok"
}
"""


class MarkFixedTest(unittest.TestCase):
    def test_keeps_formatting_and_touches_only_the_edited_lines(self):
        out = m.mark_fixed(HAND, [0, 1], URL)
        d = json.loads(out)
        self.assertEqual([x["fixed_by"] for x in d["defects"]], [URL, URL])
        self.assertEqual(d["fix_prs"], ["https://github.com/o/r/pull/1", URL])
        self.assertIn(f'   "what": "a, \\"quoted\\" thing: {{not a brace}}",\n   "fixed_by": "{URL}"\n  }}', out)
        self.assertIn(f'{{"severity": "low", "what": "one-line defect", "fixed_by": "{URL}"}}', out)
        self.assertIn(' "scores": {"correctness": 2, "craft": 3},\n', out)  # untouched lines stay byte-identical
        self.assertEqual(len(out.splitlines()), len(HAND.splitlines()) + 1)

    def test_adds_fix_prs_when_missing_and_skips_already_marked(self):
        text = '{\n  "defects": [{"what": "x", "fixed_by": "%s"}, {"what": "y"}],\n  "verdict": "v"\n}\n' % URL
        out = m.mark_fixed(text, None, URL)  # None: every defect without fixed_by
        d = json.loads(out)
        self.assertEqual(d["fix_prs"], [URL])
        self.assertTrue(out.endswith(f',\n  "fix_prs": ["{URL}"]\n}}\n'))
        self.assertEqual(m.mark_fixed(out, [0, 1], URL), out)  # idempotent

    def test_refuses_bad_index_and_other_fixed_by_unless_forced(self):
        with self.assertRaises(ValueError):
            m.mark_fixed(HAND, [5], URL)
        marked = m.mark_fixed(HAND, [0], "https://github.com/o/r/pull/1")
        with self.assertRaises(ValueError):
            m.mark_fixed(marked, [0], URL)
        forced = json.loads(m.mark_fixed(marked, [0], URL, force=True))
        self.assertEqual(forced["defects"][0]["fixed_by"], URL)

    def test_run_writes_only_when_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "2026-11-07-x.json"
            p.write_text(HAND)
            self.assertEqual(m.run(str(p), [1], URL, False, False, True, lambda d: []), 0)
            self.assertEqual(p.read_text(), HAND)  # dry run
            self.assertEqual(m.run(str(p), [1], URL, False, False, False, lambda d: ["bad"]), 1)
            self.assertEqual(p.read_text(), HAND)  # validation failed: not written
            self.assertEqual(m.run(str(p), [1], URL, False, False, False, lambda d: []), 0)
            self.assertEqual(json.loads(p.read_text())["defects"][1]["fixed_by"], URL)

    def test_every_committed_audit_takes_the_edit(self):
        audits = Path(__file__).resolve().parents[2] / "portfolio" / "quality" / "audits"
        for f in sorted(audits.glob("*.json")):
            text = f.read_text()
            n = len(json.loads(text).get("defects") or [])
            if n:
                m.mark_fixed(text, list(range(n)), URL, force=True)  # raises if the result differs from intent


if __name__ == "__main__":
    unittest.main()
