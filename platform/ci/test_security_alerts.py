import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from security_alerts import issue_body, plan, summarise  # noqa: E402


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


def issue(number, alert_number):
    return {"number": number, "body": issue_body(summarise(alert(alert_number)))}


class PlanTest(unittest.TestCase):
    def test_opens_most_severe_first_then_oldest(self):
        alerts = [alert(5, "medium"), alert(9, "critical"), alert(2, "medium"), alert(3, None, "note")]
        to_open, to_close = plan(alerts, [])
        self.assertEqual([s["number"] for s in to_open], [9, 2, 5, 3])
        self.assertEqual(to_close, [])

    def test_alert_with_an_issue_is_not_reopened(self):
        to_open, to_close = plan([alert(1, "high"), alert(2, "high")], [issue(100, 1)])
        self.assertEqual([s["number"] for s in to_open], [2])
        self.assertEqual(to_close, [])

    def test_closes_issue_when_alert_fixed_or_dismissed(self):
        alerts = [alert(1, "high", state="fixed"), alert(2, "high", state="dismissed")]
        _, to_close = plan(alerts, [issue(100, 1), issue(101, 2)])
        self.assertEqual([(i["number"], r) for i, r in to_close],
                         [(100, "completed"), (101, "not_planned")])

    def test_closes_issue_whose_alert_vanished(self):
        _, to_close = plan([], [issue(100, 7)])
        self.assertEqual([(i["number"], r) for i, r in to_close], [(100, "completed")])

    def test_ignores_issues_without_marker(self):
        to_open, to_close = plan([alert(1, "high")], [{"number": 5, "body": "unrelated"}])
        self.assertEqual(len(to_open), 1)
        self.assertEqual(to_close, [])

    def test_summary_flattens_and_normalises(self):
        s = summarise(alert(4, "HIGH"))
        self.assertEqual(s["severity"], "high")
        self.assertEqual((s["path"], s["line"]), ("a.py", 7))
        self.assertEqual(s["message"], "spread over lines")


if __name__ == "__main__":
    unittest.main()
