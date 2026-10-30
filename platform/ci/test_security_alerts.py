import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from security_alerts import branch_for, pick, summarise  # noqa: E402


def alert(number, level=None, severity="warning", state="open", path="a.py"):
    return {
        "number": number,
        "state": state,
        "rule": {"id": f"py/rule-{number}", "security_severity_level": level, "severity": severity},
        "tool": {"name": "CodeQL"},
        "most_recent_instance": {"location": {"path": path, "start_line": 7},
                                 "message": {"text": "  spread\n over lines  "}},
        "html_url": f"https://example.test/{number}",
    }


class PickTest(unittest.TestCase):
    def test_most_severe_first_then_oldest(self):
        alerts = [alert(5, "medium"), alert(9, "critical"), alert(2, "medium"), alert(3, None, "note")]
        picked, _ = pick(alerts, set(), 10)
        self.assertEqual([s["number"] for s in picked], [9, 2, 5, 3])

    def test_skips_alert_whose_branch_exists(self):
        picked, skipped = pick([alert(1, "high"), alert(2, "high")], {branch_for(1)}, 10)
        self.assertEqual([s["number"] for s in picked], [2])
        self.assertIn("fix in flight", skipped[0])

    def test_cap_reports_the_rest(self):
        picked, skipped = pick([alert(n, "high") for n in range(1, 6)], set(), 2)
        self.assertEqual([s["number"] for s in picked], [1, 2])
        self.assertEqual(len(skipped), 3)

    def test_ignores_closed_alerts(self):
        picked, _ = pick([alert(1, "high", state="dismissed"), alert(2, "high", state="fixed")], set(), 5)
        self.assertEqual(picked, [])

    def test_summary_flattens_and_normalises(self):
        s = summarise(alert(4, "HIGH"))
        self.assertEqual(s["severity"], "high")
        self.assertEqual(s["branch"], "security-fix/code-scanning-4")
        self.assertEqual((s["path"], s["line"]), ("a.py", 7))
        self.assertEqual(s["message"], "spread over lines")


if __name__ == "__main__":
    unittest.main()
