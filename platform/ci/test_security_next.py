import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

import security_next  # noqa: E402
from security_next import claimed_numbers, parse_queue, triaged_numbers, workable  # noqa: E402

QUEUE = """# Security queue

Open code-scanning alerts, most severe then oldest first. Take the first one whose claim branch
(`security-fix/code-scanning-<n>`) does not exist; its file says how.

- [high] #7 `py/clear-text-storage-sensitive-data` in `platform/security/risk_review.py:490`: alerts/7.md
- [high] #65 `js/incomplete-sanitization` in `ventures/pay-app-guides/template.test.mjs:62`: alerts/65.md
- [high] #1182 `js/redos` in `ventures/regex-redos-check/engine.test.mjs:9`: alerts/1182.md
- [medium] #997 `js/prototype-polluting-assignment` in `platform/aws/emulate.mjs:57`: alerts/997.md
"""


class ParseTest(unittest.TestCase):
    def test_queue_lines(self):
        state, alerts = parse_queue(QUEUE)
        self.assertEqual(state, "ok")
        self.assertEqual([a["n"] for a in alerts], [7, 65, 1182, 997])
        self.assertEqual(alerts[3]["sev"], "medium")
        self.assertEqual(alerts[1]["loc"], "ventures/pay-app-guides/template.test.mjs:62")

    def test_empty_and_unavailable(self):
        self.assertEqual(parse_queue("# Security queue\n\nEmpty: no open alerts.\n")[0], "empty")
        self.assertEqual(parse_queue("# Security queue\n\nUnavailable: 404\n")[0], "unavailable")

    def test_triaged_section_and_unavailable_lines_are_not_work(self):
        text = QUEUE + "\n## Triaged, awaiting dismissal\n\n- [high] #12 `py/x` in `a.py:1`: alerts/12.md\n"
        self.assertNotIn(12, [a["n"] for a in parse_queue(text)[1]])
        self.assertEqual(parse_queue("Unavailable: 403\n- [high] #7 `r` in `a.py:1`: alerts/7.md\n"),
                         ("unavailable", []))
        self.assertEqual(parse_queue("Empty: no open alerts awaiting a fix.\n\n## Triaged, awaiting "
                                     "dismissal\n\n- [high] #7 `r` in `a.py:1`: alerts/7.md\n")[0], "empty")

    def test_json_triage(self):
        self.assertEqual(security_next.json_triaged('{"false_positives": [{"number": 7}, {"number": "x"}, 3]}'), {7})
        self.assertEqual(security_next.json_triaged("not json"), set())

    def test_claimed(self):
        out = ("abc\trefs/heads/security-fix/code-scanning-7\n"
               "def\trefs/heads/security-fix/code-scanning-1182\n"
               "fff\trefs/heads/security-fix/code-scanning-batch\n")
        self.assertEqual(claimed_numbers(out), {7, 1182})

    def test_triaged_rows_lists_and_ranges(self):
        notes = "\n".join([
            "The queue had 1,186 alerts; #5 in prose is not a finding.",
            "| #7, #42, #43 | py/clear-text | `risk_review.py` | safe |",
            "| #68–#91 and the other `usage.mjs` | js/clear-text-storage | x | y |",
            "  - #1181 to #1203 `js/redos` in tests",
            "- #1 to #99999 typo range is ignored, its ends still count",
        ])
        seen = triaged_numbers([notes])
        self.assertTrue({7, 42, 43, 68, 80, 91, 1181, 1190, 1203, 1, 99999} <= seen)
        self.assertNotIn(5, seen)
        self.assertNotIn(500, seen)

    def test_workable_skips_claimed_and_triaged(self):
        _, alerts = parse_queue(QUEUE)
        self.assertEqual([a["n"] for a in workable(alerts, {65}, {7, 1182})], [997])

    def test_real_triage_notes_parse(self):
        texts = [p.read_text(encoding="utf-8") for p in security_next.ROOT.glob(security_next.TRIAGE_GLOB)]
        if texts:
            self.assertIn(7, triaged_numbers(texts))


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


class ClaimTest(unittest.TestCase):
    """The claim is create-only: a second push for the same alert fails."""

    def test_second_claim_loses(self):
        with tempfile.TemporaryDirectory() as tmp:
            bare, a, b = (Path(tmp) / x for x in ("origin.git", "a", "b"))
            run(tmp, "init", "-q", "--bare", str(bare))
            for clone in (a, b):
                run(tmp, "clone", "-q", str(bare), str(clone))
                run(clone, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                    "commit", "-q", "--allow-empty", "-m", f"base {clone.name}")
            with mock.patch.object(security_next, "ROOT", a):
                self.assertTrue(security_next.claim(1049, "HEAD"))
            with mock.patch.object(security_next, "ROOT", b):
                self.assertFalse(security_next.claim(1049, "HEAD"))
                self.assertTrue(security_next.claim(1050, "HEAD"))
            refs = run(a, "ls-remote", "origin").stdout
            self.assertIn(f"refs/heads/{security_next.BRANCH_PREFIX}1049", refs)
            self.assertIn(f"refs/heads/{security_next.BRANCH_PREFIX}1050", refs)


if __name__ == "__main__":
    unittest.main()
