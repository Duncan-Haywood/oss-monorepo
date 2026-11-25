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


SHA_A = "a" * 40
SHA_B = "b" * 40


def alert(number, level=None, severity="warning", state="open", path="a.py", commit=None):
    return {
        "number": number,
        "state": state,
        "rule": {"id": f"py/rule-{number}", "security_severity_level": level, "severity": severity},
        "tool": {"name": "CodeQL"},
        "most_recent_instance": {"location": {"path": path, "start_line": 7},
                                 "message": {"text": "  spread\n over lines  "},
                                 **({"commit_sha": commit} if commit is not None else {})},
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

    def test_alert_file_says_how_to_check_the_finding_is_still_on_main(self):
        text = render([alert(4, "high", commit=SHA_A)])["alerts/4.md"]
        self.assertIn(f"Last seen on commit: `{SHA_A}`", text)
        self.assertIn(f"git fetch -q --depth=1 origin {SHA_A} main && git diff --stat {SHA_A[:12]} origin/main -- 'a.py'", text)
        self.assertLess(text.index("0. Check it is still there"), text.index("1. Claim it"))

    def test_no_commit_means_no_stale_check_and_no_header(self):
        files = render([alert(4, "high")])
        self.assertNotIn("Check it is still there", files["alerts/4.md"])
        self.assertIn("Last seen on commit: `unknown`", files["alerts/4.md"])
        self.assertNotIn("Scanned commit", files["QUEUE.md"])

    def test_queue_names_the_commit_most_alerts_were_seen_on(self):
        files = render([alert(1, "high", commit=SHA_B), alert(2, "high", commit=SHA_A),
                        alert(3, "high", commit=SHA_A)])
        self.assertIn(f"Scanned commit: `{SHA_A[:12]}`", files["QUEUE.md"])

    def test_commit_and_path_cannot_inject_into_the_pasted_command(self):
        # A sha that is not 40 hex characters is dropped, and a path that could leave the
        # single quotes is left out of the command the session pastes into a shell.
        bad_sha = render([alert(4, "high", commit="$(touch pwned)" + "a" * 26)])["alerts/4.md"]
        self.assertNotIn("pwned", bad_sha)
        self.assertNotIn("git fetch", bad_sha)
        bad_path = render([alert(5, "high", commit=SHA_A, path="x';touch pwned;'.js")])["alerts/5.md"]
        command = [ln for ln in bad_path.splitlines() if "git fetch" in ln][0]
        self.assertNotIn("pwned", command)
        self.assertTrue(command.rstrip().endswith("origin/main`"))
        route = render([alert(6, "high", commit=SHA_A, path="app/api/[slug]/route.ts")])["alerts/6.md"]
        self.assertIn("-- 'app/api/[slug]/route.ts'", route)

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


class TriageTest(unittest.TestCase):
    def entry(self, number, rule=None, path="a.py", reason="read it: harmless"):
        return {"number": number, "rule": rule or f"py/rule-{number}", "path": path, "reason": reason}

    def test_triaged_alert_leaves_the_work_list_but_stays_visible(self):
        files = render([alert(1, "high"), alert(2, "high")], [self.entry(1)])
        work, _, triaged = files["QUEUE.md"].partition("## Triaged, awaiting dismissal")
        self.assertNotIn("#1 ", work)
        self.assertIn("#2 ", work)
        self.assertIn("#1 ", triaged)
        self.assertIn("false positive", files["alerts/1.md"])
        self.assertIn("read it: harmless", files["alerts/1.md"])
        self.assertIn("Claim it", files["alerts/2.md"])

    def test_entry_must_match_number_rule_and_path(self):
        for wrong in (self.entry(1, rule="py/other"), self.entry(1, path="b.py"),
                      self.entry(9), self.entry(1, reason="  ")):
            queue = render([alert(1, "high")], [wrong])["QUEUE.md"]
            self.assertNotIn("Triaged", queue, wrong)
            self.assertIn("- [high] #1 ", queue)

    def test_all_triaged_says_empty_of_work(self):
        queue = render([alert(1, "high")], [self.entry(1)])["QUEUE.md"]
        self.assertIn("Empty: no open alerts awaiting a fix.", queue)

    def test_unavailable_keeps_only_work_lines(self):
        previous = render([alert(1, "high"), alert(2, "high")], [self.entry(1)])["QUEUE.md"]
        text = security_alerts.unavailable(404, "", previous)
        self.assertIn("#2 ", text)
        self.assertNotIn("#1 ", text)

    def test_load_triage_tolerates_missing_and_bad_files(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(security_alerts.load_triage(Path(d) / "none.json"), [])
            bad = Path(d) / "bad.json"
            bad.write_text("{not json")
            self.assertEqual(security_alerts.load_triage(bad), [])

    def test_repository_triage_file_is_well_formed(self):
        entries = security_alerts.load_triage(security_alerts.TRIAGE)
        self.assertTrue(entries)
        root = security_alerts.TRIAGE.parents[2]
        for e in entries:
            self.assertIsInstance(e["number"], int)
            self.assertRegex(e["rule"], r"^[a-z]+/[a-z-]+$")
            self.assertTrue((root / e["path"]).exists(), e["path"])
            self.assertGreater(len(e["reason"]), 40, e)


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

    def test_http_error_marks_queue_unavailable_keeps_alerts_and_exits_1(self):
        err = urllib.error.HTTPError("u", 403, "no", {}, None)
        with tempfile.TemporaryDirectory() as d:
            write_tree(Path(d), render([alert(7, "high")]))
            with mock.patch.object(security_alerts, "fetch_alerts", side_effect=err), \
                    mock.patch("sys.stdout", io.StringIO()):
                self.assertEqual(self._run({"GITHUB_TOKEN": "t"}, ["--repo", "o/r", "--out", d]), 1)
            text = (Path(d) / "QUEUE.md").read_text()
            self.assertTrue(text.splitlines()[2].startswith(security_alerts.UNAVAILABLE))
            self.assertIn("HTTP 403", text)
            self.assertIn("- [high] #7", text)
            self.assertTrue((Path(d) / "alerts" / "7.md").exists())

    def test_404_names_the_api_message_and_missing_codeql(self):
        body = io.BytesIO(b'{"message": "no analysis found"}')
        err = urllib.error.HTTPError("u", 404, "Not Found", {}, body)
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "fresh"
            with mock.patch.object(security_alerts, "fetch_alerts", side_effect=err), \
                    mock.patch("sys.stdout", io.StringIO()) as stdout:
                self.assertEqual(self._run({"GITHUB_TOKEN": "t"}, ["--repo", "o/r", "--out", str(out)]), 1)
            text = (out / "QUEUE.md").read_text()
            self.assertIn("(no analysis found)", text)
            self.assertIn("priv-codeql.yml", text)
            self.assertNotIn("- [", text)
            self.assertIn("::error::", stdout.getvalue())

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
