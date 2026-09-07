#!/usr/bin/env python3
"""Tests for check.py.

Mirrors classify.test.mjs case for case, since the two are meant to agree —
a visitor who checks the same reports in the browser and the CLI should get
the same verdict either way.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

import check as ftf


def junit(cases):
    parts = []
    for case in cases:
        classname = case.get("classname", "suite.Thing")
        name = case["name"]
        outcome = case.get("outcome", "pass")
        message = case.get("message", "boom")
        if outcome == "pass":
            parts.append(f'<testcase classname="{classname}" name="{name}" time="0.01"/>')
        elif outcome == "fail":
            parts.append(f'<testcase classname="{classname}" name="{name}" time="0.01"><failure message="{message}">trace</failure></testcase>')
        elif outcome == "error":
            parts.append(f'<testcase classname="{classname}" name="{name}" time="0.01"><error message="{message}">trace</error></testcase>')
        elif outcome == "skip":
            parts.append(f'<testcase classname="{classname}" name="{name}" time="0.01"><skipped/></testcase>')
        else:
            raise ValueError(f"unknown outcome {outcome}")
    body = "\n".join(parts)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="suite" tests="{len(cases)}">\n{body}\n</testsuite></testsuites>'


class ReadTestcases(unittest.TestCase):
    def test_reads_status_and_message(self):
        rows = list(ftf.read_testcases(junit([
            {"name": "test_one", "outcome": "pass"},
            {"name": "test_two", "outcome": "fail", "message": "AssertionError"},
            {"name": "test_three", "outcome": "skip"},
        ]), "run"))
        self.assertEqual([r["status"] for r in rows], ["passed", "failed", "skipped"])
        self.assertEqual(rows[1]["message"], "AssertionError")

    def test_invalid_xml_raises_with_label(self):
        with self.assertRaises(ValueError) as ctx:
            list(ftf.read_testcases("not xml", "run 3"))
        self.assertIn("run 3", str(ctx.exception))


class ClassifyRuns(unittest.TestCase):
    def test_fail_then_pass_is_flaky(self):
        rows = ftf.classify_runs([
            {"label": "attempt 1", "xml": junit([{"name": "test_login", "outcome": "fail"}])},
            {"label": "attempt 2", "xml": junit([{"name": "test_login", "outcome": "pass"}])},
        ])
        self.assertEqual(rows[0]["verdict"], "flaky")
        self.assertEqual(rows[0]["passed"], 1)
        self.assertEqual(rows[0]["failed"], 1)

    def test_fail_every_time_is_broken_not_flaky(self):
        rows = ftf.classify_runs([
            {"xml": junit([{"name": "test_checkout", "outcome": "fail"}])},
            {"xml": junit([{"name": "test_checkout", "outcome": "fail"}])},
        ])
        self.assertEqual(rows[0]["verdict"], "broken")

    def test_pass_every_time_is_stable(self):
        rows = ftf.classify_runs([
            {"xml": junit([{"name": "test_home", "outcome": "pass"}])},
            {"xml": junit([{"name": "test_home", "outcome": "pass"}])},
        ])
        self.assertEqual(rows[0]["verdict"], "stable")

    def test_subset_of_tests_in_a_rerun_is_still_classified(self):
        """A CI job that reruns only previously-failed tests must not read as
        'test missing' — the test was legitimately not retried elsewhere."""
        rows = ftf.classify_runs([
            {"label": "full suite", "xml": junit([
                {"name": "test_stable", "outcome": "pass"},
                {"name": "test_flaky", "outcome": "fail"},
            ])},
            {"label": "rerun of failures", "xml": junit([{"name": "test_flaky", "outcome": "pass"}])},
        ])
        by_name = {r["name"]: r for r in rows}
        self.assertEqual(by_name["test_flaky"]["verdict"], "flaky")
        self.assertEqual(by_name["test_flaky"]["seen_in_runs"], 2)
        self.assertEqual(by_name["test_stable"]["seen_in_runs"], 1)

    def test_same_short_name_different_classname_not_conflated(self):
        rows = ftf.classify_runs([{"xml": junit([
            {"classname": "pkg.A", "name": "test_it", "outcome": "pass"},
            {"classname": "pkg.B", "name": "test_it", "outcome": "fail"},
        ])}])
        by_class = {r["classname"]: r["verdict"] for r in rows}
        self.assertEqual(by_class["pkg.A"], "stable")
        self.assertEqual(by_class["pkg.B"], "broken")

    def test_delimiter_containing_identities_are_not_conflated(self):
        cases = [
            {"classname": "pkg::Suite", "name": "test_it", "outcome": "pass"},
            {"classname": "pkg", "name": "Suite::test_it", "outcome": "fail"},
            {"classname": "", "name": "pkg::Suite::test_it", "outcome": "skip"},
        ]
        rows = ftf.classify_runs([{"xml": junit(cases)}, {"xml": junit(cases)}])
        self.assertEqual(len(rows), 3)
        for case, verdict in zip(cases, ["stable", "broken", "skipped-only"]):
            row = next(r for r in rows if r["classname"] == case["classname"])
            self.assertEqual(row["name"], case["name"])
            self.assertEqual(row["verdict"], verdict)
            self.assertEqual(row["seen_in_runs"], 2)
            self.assertEqual(row["passed"] + row["failed"] + row["skipped"], 2)
        self.assertIn("1 test(s) failed every time", ftf.summarize(rows, 2))

    def test_surefire_flaky_failure_element_is_a_direct_signal(self):
        xml = """<testsuite>
          <testcase classname="t" name="test_x" time="0.2">
            <flakyFailure message="first attempt failed">trace</flakyFailure>
          </testcase>
        </testsuite>"""
        rows = ftf.classify_runs([{"xml": xml}])
        self.assertEqual(rows[0]["verdict"], "flaky")

    def test_empty_run_list_raises(self):
        with self.assertRaises(ValueError):
            ftf.classify_runs([])


class Summarize(unittest.TestCase):
    def test_flaky_reported_first(self):
        rows = ftf.classify_runs([
            {"xml": junit([{"name": "test_a", "outcome": "fail"}, {"name": "test_b", "outcome": "fail"}])},
            {"xml": junit([{"name": "test_a", "outcome": "pass"}, {"name": "test_b", "outcome": "fail"}])},
        ])
        text = ftf.summarize(rows, 2)
        self.assertIn("1 of 2", text)


class MainCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name, content):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        return path

    def test_exit_1_when_a_test_is_flaky(self):
        a = self.write("run1.xml", junit([{"name": "test_x", "outcome": "fail"}]))
        b = self.write("run2.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        self.assertEqual(ftf.main([a, b]), 1)

    def test_exit_0_when_nothing_is_flaky(self):
        a = self.write("run1.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        b = self.write("run2.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        self.assertEqual(ftf.main([a, b]), 0)

    def test_exit_2_on_missing_files(self):
        self.assertEqual(ftf.main([]), 2)

    def test_glob_matches_files(self):
        self.write("a.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        self.write("b.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        exit_code = ftf.main(["--glob", os.path.join(self.tmp.name, "*.xml")])
        self.assertEqual(exit_code, 0)

    def test_json_output_is_valid_json(self):
        a = self.write("run1.xml", junit([{"name": "test_x", "outcome": "pass"}]))
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "check.py"), a, "--json"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(proc.returncode, 0)
        payload = json.loads(proc.stdout)
        self.assertEqual(payload["runs"], 1)


if __name__ == "__main__":
    unittest.main()
