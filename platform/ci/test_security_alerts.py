import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from security_alerts import render, summarise, write_tree  # noqa: E402


def alert(number, level=None, severity="warning", state="open", path="a.py"):
    return {
        "number": number,
        "state": state,
        "rule": {"id": f"py/rule-{number}", "security_severity_level": level, "severity": severity},
        "tool": {"name": "CodeQL"},
        "most_recent_instance": {"location": {"path": path, "start_line": 7},
                                 "message": {"text": "  spread\n over lines  "}},
        "created_at": "2026-10-01T00:00:00Z",
        "html_url": f"https://example.test/{number}",
    }


class RenderTest(unittest.TestCase):
    def test_queue_is_most_severe_first_then_oldest(self):
        files = render([alert(5, "medium"), alert(9, "critical"), alert(2, "medium"), alert(3, None, "note")])
        order = [line.split("#")[1].split(" ")[0] for line in files["QUEUE.md"].splitlines()
                 if line.startswith("- [")]
        self.assertEqual(order, ["9", "2", "5", "3"])
        self.assertEqual(sorted(files), ["QUEUE.md", "alerts/2.md", "alerts/3.md",
                                         "alerts/5.md", "alerts/9.md"])

    def test_closed_alerts_have_no_file(self):
        files = render([alert(1, "high", state="fixed"), alert(2, "high", state="dismissed")])
        self.assertEqual(list(files), ["QUEUE.md"])
        self.assertIn("Empty", files["QUEUE.md"])

    def test_alert_file_names_claim_branch(self):
        text = render([alert(4, "high")])["alerts/4.md"]
        self.assertIn("security-fix/code-scanning-4", text)
        self.assertIn("`a.py:7`", text)

    def test_summary_flattens_and_normalises(self):
        s = summarise(alert(4, "HIGH"))
        self.assertEqual(s["severity"], "high")
        self.assertEqual(s["message"], "spread over lines")
        self.assertEqual(s["created"], "2026-10-01")

    def test_write_tree_drops_files_of_closed_alerts(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            write_tree(out, render([alert(1, "high"), alert(2, "low")]))
            write_tree(out, render([alert(2, "low")]))
            self.assertEqual(sorted(p.name for p in (out / "alerts").iterdir()), ["2.md"])


if __name__ == "__main__":
    unittest.main()
