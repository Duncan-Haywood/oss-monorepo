import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

import io
import json
import urllib.error
from unittest import mock

import security_alerts  # noqa: E402
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

    def test_every_severity_label_ranks_in_order(self):
        # critical > high = error > medium = warning > low > note > unknown.
        labels = ["critical", "high", "medium", "low", "note", "unknown"]
        alerts = [alert(n, lv) for n, lv in zip(range(1, 7), reversed(labels[:5]))]
        alerts.append(alert(7, None, "mystery"))
        files = render(alerts)
        order = [int(line.split("#")[1].split(" ")[0]) for line in files["QUEUE.md"].splitlines()
                 if line.startswith("- [")]
        self.assertEqual(order, [5, 4, 3, 2, 1, 7])
        self.assertEqual(security_alerts.RANK["error"], security_alerts.RANK["high"])
        self.assertEqual(security_alerts.RANK["warning"], security_alerts.RANK["medium"])

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


class MainTest(unittest.TestCase):
    def test_tool_name_survives_missing_tool(self):
        self.assertEqual(summarise(alert(1))["tool"], "CodeQL")
        a = alert(1)
        a["tool"] = None
        self.assertEqual(summarise(a)["tool"], "")
        a["tool"] = {"name": None}
        self.assertEqual(summarise(a)["tool"], "")

    def _run(self, env, argv):
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch("sys.stderr", io.StringIO()):
            return security_alerts.main(argv)

    def test_missing_repo_or_token_exits_2_without_fetching(self):
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(security_alerts, "fetch_alerts") as fetch:
            self.assertEqual(self._run({"GITHUB_TOKEN": "t"}, ["--out", d]), 2)
            self.assertEqual(self._run({}, ["--repo", "o/r", "--out", d]), 2)
            fetch.assert_not_called()

    def test_http_error_leaves_queue_untouched_and_exits_0(self):
        err = urllib.error.HTTPError("u", 403, "no", {}, None)
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "QUEUE.md").write_text("old")
            with mock.patch.object(security_alerts, "fetch_alerts", side_effect=err):
                self.assertEqual(self._run({"GITHUB_TOKEN": "t"}, ["--repo", "o/r", "--out", d]), 0)
            self.assertEqual((Path(d) / "QUEUE.md").read_text(), "old")

    def test_success_writes_queue_and_exits_0(self):
        with tempfile.TemporaryDirectory() as d, mock.patch("sys.stdout", io.StringIO()), \
                mock.patch.object(security_alerts, "fetch_alerts", return_value=[alert(3, "high")]):
            self.assertEqual(self._run({"GITHUB_TOKEN": "t"}, ["--repo", "o/r", "--out", d]), 0)
            self.assertTrue((Path(d) / "alerts" / "3.md").exists())

    def test_fetch_pages_from_one_and_stops_on_short_page(self):
        urls = []

        def fake(req, timeout=0):
            urls.append(req.full_url)
            n = 100 if len(urls) == 1 else 1
            return io.BytesIO(json.dumps([{"number": i} for i in range(n)]).encode())

        with mock.patch("urllib.request.urlopen", side_effect=fake):
            got = security_alerts.fetch_alerts("o/r", "t")
        self.assertEqual(len(got), 101)
        self.assertTrue(urls[0].endswith("page=1"))
        self.assertTrue(urls[1].endswith("page=2"))
        self.assertEqual(len(urls), 2)

    def test_fetch_caps_at_50_pages(self):
        def fake(req, timeout=0):
            return io.BytesIO(json.dumps([{"number": 1}] * 100).encode())

        with mock.patch("urllib.request.urlopen", side_effect=fake) as m:
            security_alerts.fetch_alerts("o/r", "t")
        self.assertEqual(m.call_count, 50)


if __name__ == "__main__":
    unittest.main()
