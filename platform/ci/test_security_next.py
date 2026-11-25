import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

import security_alerts  # noqa: E402
import security_next  # noqa: E402
from security_next import claimed_numbers, json_triaged, parse_queue, pick, triaged_numbers  # noqa: E402

QUEUE = """# Security queue

Scanned commit: `8e093a6fe6a3` (the commit ...).

- [high] #7 `py/clear-text-storage-sensitive-data` in `platform/security/risk_review.py:490`: alerts/7.md
- [high] #65 `js/incomplete-sanitization` in `ventures/pay-app-guides/template.test.mjs:62`: alerts/65.md
- [medium] #120 `js/double-escaping` in `a.test.mjs:3`: alerts/120.md
- [medium] #200 `js/xss` in `b.html:9`: alerts/200.md
"""

TRIAGE = """# Security queue: alerts checked

| Alert | Rule |
| --- | --- |
| #7, #42 | py/clear-text |
| #68–#91 and the other usage.mjs | js/clear-text-storage |

- #115 to #118. Each decoder now decodes last.

## Not checked this run

Everything else, including #200.

## Second pass

- **Still unchecked:** the remaining alerts, #119 onward.
- #65 already fixed on main.
"""


class ParseTest(unittest.TestCase):
    def test_queue_lines_in_order(self):
        alerts, unavailable = parse_queue(QUEUE)
        self.assertIsNone(unavailable)
        self.assertEqual([a["number"] for a in alerts], [7, 65, 120, 200])
        self.assertEqual(alerts[1]["rule"], "js/incomplete-sanitization")

    def test_unavailable(self):
        alerts, unavailable = parse_queue("# Security queue\n\nUnavailable: HTTP 403\n")
        self.assertEqual(alerts, [])
        self.assertTrue(unavailable.startswith("Unavailable:"))

    def test_empty_queue(self):
        self.assertEqual(parse_queue("# Security queue\n\nEmpty: no open alerts.\n"), ([], None))

    def test_parses_what_security_alerts_renders(self):
        # The queue format and this parser live in two files; keep them in step.
        a = {"number": 9, "state": "open",
             "rule": {"id": "js/xss", "security_severity_level": "high", "severity": "error"},
             "tool": {"name": "CodeQL"},
             "most_recent_instance": {"location": {"path": "x.html", "start_line": 4},
                                      "message": {"text": "m"}, "commit_sha": "c" * 40},
             "created_at": "2026-11-25T00:00:00Z", "html_url": "https://example.test/9"}
        alerts, _ = parse_queue(security_alerts.render([a])["QUEUE.md"])
        self.assertEqual([(x["number"], x["rule"]) for x in alerts], [(9, "js/xss")])
        self.assertEqual(security_next.BRANCH_PREFIX, security_alerts.BRANCH_PREFIX)
        self.assertEqual(security_next.TRIAGE_GLOB, security_alerts.TRIAGE_NOTES)

    def test_triaged_ranges_and_singles(self):
        t = triaged_numbers(TRIAGE)
        self.assertTrue({7, 42, 65, 68, 80, 91, 115, 116, 118} <= t)
        self.assertNotIn(92, t)

    def test_unchecked_numbers_are_not_triaged(self):
        t = triaged_numbers(TRIAGE)
        self.assertNotIn(200, t)  # under "Not checked this run"
        self.assertNotIn(119, t)  # "#119 onward" on an "unchecked" line

    def test_triaged_section_is_not_work(self):
        q = QUEUE + "\n## Triaged, awaiting dismissal\n\n- [high] #12 `py/x` in `a.py:1`: alerts/12.md\n"
        self.assertNotIn(12, [a["number"] for a in parse_queue(q)[0]])

    def test_json_triage(self):
        self.assertEqual(json_triaged('{"false_positives": [{"number": 7}, {"number": "x"}, 3]}'), {7})
        self.assertEqual(json_triaged(""), set())
        self.assertEqual(json_triaged("[]"), set())

    def test_claimed_from_ls_remote(self):
        out = ("abc\trefs/heads/security-fix/code-scanning-7\n"
               "def\trefs/heads/security-fix/code-scanning-1049\n"
               "123\trefs/heads/security-fix/code-scanning-batch\n")
        self.assertEqual(claimed_numbers(out), {7, 1049})

    def test_pick_skips_claimed_and_triaged(self):
        alerts, _ = parse_queue(QUEUE)
        todo = pick(alerts, claimed={120}, triaged=triaged_numbers(TRIAGE))
        self.assertEqual([a["number"] for a in todo], [200])
        self.assertEqual(pick(alerts, claimed={7, 65, 120, 200}, triaged=set()), [])


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


class ClaimRaceTest(unittest.TestCase):
    """claim() against a real remote: create-only, so the second run for one alert loses."""

    def test_second_claim_loses(self):
        here = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            bare, a, b = (Path(tmp) / x for x in ("origin.git", "a", "b"))
            run(tmp, "init", "-q", "--bare", "-b", "main", str(bare))
            run(tmp, "clone", "-q", str(bare), str(a))
            run(a, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                "commit", "-q", "--allow-empty", "-m", "base")
            run(a, "push", "-q", "origin", "HEAD:refs/heads/main")
            run(a, "fetch", "-q", "origin")
            run(tmp, "clone", "-q", str(bare), str(b))
            try:
                os.chdir(a)
                self.assertTrue(security_next.claim(1049))
                run(b, "fetch", "-q", "origin")
                os.chdir(b)
                self.assertIsNone(security_next.claim(1049))
                self.assertTrue(security_next.claim(1050))
            finally:
                os.chdir(here)
            refs = run(a, "ls-remote", "origin").stdout
            for n in (1049, 1050):
                self.assertIn(f"refs/heads/{security_next.BRANCH_PREFIX}{n}", refs)


if __name__ == "__main__":
    unittest.main()
