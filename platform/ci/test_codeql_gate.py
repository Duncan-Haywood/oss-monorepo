import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

import codeql_gate  # noqa: E402
from codeql_gate import changed_lines, evaluate, findings, report  # noqa: E402


def sarif(results, rules):
    return {"runs": [{"tool": {"driver": {"name": "CodeQL", "rules": rules}}, "results": results}]}


def rule(rid, score=None, level="warning"):
    r = {"id": rid, "shortDescription": {"text": rid}, "defaultConfiguration": {"level": level}}
    if score is not None:
        r["properties"] = {"security-severity": str(score)}
    return r


def result(rid, path, line, msg="bad", **extra):
    return {"ruleId": rid, "message": {"text": msg},
            "locations": [{"physicalLocation": {"artifactLocation": {"uri": path},
                                                "region": {"startLine": line}}}], **extra}


DIFF = """diff --git a/app.py b/app.py
--- a/app.py
+++ b/app.py
@@ -10,0 +11,3 @@ def f():
+x
+y
+z
@@ -40 +43 @@
-old
+new
diff --git a/gone.py b/gone.py
--- a/gone.py
+++ /dev/null
@@ -1,2 +0,0 @@
-a
-b
diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1 @@
+eval(x)
"""


class ChangedLinesTest(unittest.TestCase):
    def test_hunks_map_to_added_lines(self):
        got = changed_lines(DIFF)
        self.assertEqual(got["app.py"], {11, 12, 13, 43})
        self.assertEqual(got["new.js"], {1})
        self.assertNotIn("gone.py", got)

    def test_pure_deletion_hunk_adds_nothing(self):
        got = changed_lines("+++ b/a.py\n@@ -5,2 +4,0 @@\n")
        self.assertEqual(got["a.py"], set())


class EvaluateTest(unittest.TestCase):
    def setUp(self):
        self.rules = [rule("py/sql-injection", 8.8), rule("py/weak-hash", 3.1),
                      rule("js/code-injection", 9.3), rule("actions/thing", None, "error"),
                      rule("py/quality", None, "warning")]

    def run_gate(self, results):
        return evaluate(findings(sarif(results, self.rules)), changed_lines(DIFF))

    def test_serious_finding_on_changed_line_fails(self):
        fail, warn = self.run_gate([result("py/sql-injection", "app.py", 12)])
        self.assertEqual([f["rule"] for f in fail], ["py/sql-injection"])
        self.assertEqual(warn, [])

    def test_serious_finding_on_untouched_line_only_warns(self):
        fail, warn = self.run_gate([result("py/sql-injection", "app.py", 30),
                                    result("py/sql-injection", "other.py", 1)])
        self.assertEqual(fail, [])
        self.assertEqual(len(warn), 2)

    def test_low_score_never_blocks(self):
        fail, warn = self.run_gate([result("py/weak-hash", "app.py", 11)])
        self.assertEqual((fail, warn), ([], []))

    def test_unscored_error_blocks_but_unscored_warning_does_not(self):
        fail, _ = self.run_gate([result("actions/thing", "app.py", 43),
                                 result("py/quality", "app.py", 43)])
        self.assertEqual([f["rule"] for f in fail], ["actions/thing"])

    def test_new_file_findings_fail_most_severe_first(self):
        fail, _ = self.run_gate([result("py/sql-injection", "app.py", 13),
                                 result("js/code-injection", "new.js", 1)])
        self.assertEqual([f["rule"] for f in fail], ["js/code-injection", "py/sql-injection"])

    def test_suppressed_results_are_ignored(self):
        fail, warn = self.run_gate([result("py/sql-injection", "app.py", 12,
                                           suppressions=[{"kind": "external"}])])
        self.assertEqual((fail, warn), ([], []))

    def test_rules_in_extensions_are_found(self):
        doc = {"runs": [{"tool": {"driver": {"name": "CodeQL", "rules": []},
                                  "extensions": [{"name": "pack", "rules": [rule("py/x", 7.5)]}]},
                         "results": [result("py/x", "app.py", 11)]}]}
        fail, _ = evaluate(findings(doc), changed_lines(DIFF))
        self.assertEqual(fail[0]["score"], 7.5)

    def test_report_tells_the_reader_what_to_do(self):
        fail, warn = self.run_gate([result("py/sql-injection", "app.py", 12, "query built from input"),
                                    result("js/code-injection", "old.js", 3)])
        text = report(fail, warn)
        self.assertIn("[high] `py/sql-injection` at `app.py:12`: query built from input", text)
        self.assertIn("No `codeql[...]`/`lgtm` suppression", text)
        self.assertIn("security-alerts", text)
        self.assertIn("No medium-or-worse", report([], []))


class MainTest(unittest.TestCase):
    def test_exit_code_and_annotation_against_a_real_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            git = lambda *a: subprocess.run(["git", "-C", tmp, *a], check=True, capture_output=True)  # noqa: E731
            git("init", "-q")
            git("config", "user.email", "t@example.test")
            git("config", "user.name", "t")
            (repo / "a.py").write_text("ok\n")
            git("add", "-A")
            git("commit", "-qm", "base")
            (repo / "a.py").write_text("ok\nquery = 'x' + y\n")
            git("commit", "-qam", "change")
            out = repo / "s.sarif"
            out.write_text(json.dumps(sarif([result("py/sql-injection", "a.py", 2, "a: b, c")],
                                            [rule("py/sql-injection", 8.8)])))
            cwd = os.getcwd()
            os.chdir(tmp)
            try:
                with unittest.mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": ""}), \
                        unittest.mock.patch("sys.stdout") as stdout:
                    code = codeql_gate.main(["--sarif", str(repo), "--base", "HEAD^1"])
            finally:
                os.chdir(cwd)
            printed = "".join(c.args[0] for c in stdout.write.call_args_list)
            self.assertEqual(code, 1)
            self.assertIn("::error file=a.py,line=2,title=CodeQL py/sql-injection::a: b, c", printed)


    def test_a_non_utf8_byte_in_the_diff_does_not_crash_the_gate(self):
        # PR 19220: a moved Latin-1 fixture made the strict decode raise before any finding was read.
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            git = lambda *a: subprocess.run(["git", "-C", tmp, *a], check=True, capture_output=True)  # noqa: E731
            git("init", "-q")
            git("config", "user.email", "t@example.test")
            git("config", "user.name", "t")
            (repo / "a.py").write_text("ok\n")
            git("add", "-A")
            git("commit", "-qm", "base")
            (repo / "latin1.txt").write_bytes(b"caf\xe9 \xf3\n")
            (repo / "a.py").write_text("ok\nquery = 'x' + y\n")
            git("add", "-A")
            git("commit", "-qm", "change")
            out = repo / "s.sarif"
            out.write_text(json.dumps(sarif([result("py/sql-injection", "a.py", 2, "m")],
                                            [rule("py/sql-injection", 8.8)])))
            cwd = os.getcwd()
            os.chdir(tmp)
            try:
                with unittest.mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": ""}), \
                        unittest.mock.patch("sys.stdout"):
                    code = codeql_gate.main(["--sarif", str(repo), "--base", "HEAD^1"])
            finally:
                os.chdir(cwd)
            self.assertEqual(code, 1)  # still fails on the real finding, instead of crashing

import unittest.mock  # noqa: E402

if __name__ == "__main__":
    unittest.main()
