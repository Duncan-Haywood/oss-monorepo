#!/usr/bin/env python3
"""Tests for check.py.

Mirrors compare.test.mjs case for case, since the two are meant to agree —
a visitor who checks the same reports in the browser and the CLI should get
the same verdict either way.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

import check as cdc


def cobertura(covered, valid, files):
    classes = []
    for item in files:
        lines = "".join(
            f'<line number="{line["number"]}" hits="{line["hits"]}"/>'
            for line in item["lines"]
        )
        filename = item["filename"]
        classes.append(
            f'<class name="{filename}" filename="{filename}"><lines>{lines}</lines></class>'
        )
    rate = (covered / valid) if valid else 0
    return (
        '<?xml version="1.0"?>\n'
        f'<coverage line-rate="{rate}" lines-covered="{covered}" lines-valid="{valid}">'
        f'<packages><package name="p"><classes>{"".join(classes)}</classes></package></packages>'
        "</coverage>"
    )


def jacoco(covered, valid, files):
    pkgs = {}
    for item in files:
        filename = item["filename"]
        slash = filename.rfind("/")
        pkg = "" if slash == -1 else filename[:slash]
        name = filename if slash == -1 else filename[slash + 1 :]
        missed = item["valid"] - item["covered"]
        src = (
            f'<sourcefile name="{name}">'
            f'<counter type="LINE" missed="{missed}" covered="{item["covered"]}"/>'
            "</sourcefile>"
        )
        pkgs.setdefault(pkg, []).append(src)
    package_xml = "".join(
        f'<package name="{name}">{"".join(srcs)}</package>' for name, srcs in pkgs.items()
    )
    missed = valid - covered
    return (
        '<?xml version="1.0"?>\n'
        f'<report name="suite">{package_xml}'
        f'<counter type="LINE" missed="{missed}" covered="{covered}"/></report>'
    )


class ParseCoverage(unittest.TestCase):
    def test_reads_cobertura_overall_and_per_file(self):
        report = cdc.read_coverage(
            cobertura(3, 4, [
                {"filename": "a.py", "lines": [{"number": 1, "hits": 1}, {"number": 2, "hits": 1}]},
                {"filename": "b.py", "lines": [{"number": 1, "hits": 1}, {"number": 2, "hits": 0}]},
            ]),
            "run",
        )
        self.assertEqual(report["format"], "cobertura")
        self.assertEqual(report["covered"], 3)
        self.assertEqual(report["valid"], 4)
        self.assertEqual(report["lineRate"], 0.75)
        self.assertEqual(report["files"]["a.py"]["lineRate"], 1)
        self.assertEqual(report["files"]["b.py"]["lineRate"], 0.5)

    def test_reads_jacoco_line_counters_and_package_paths(self):
        report = cdc.read_coverage(
            jacoco(5, 10, [{"filename": "com/example/Foo.java", "covered": 5, "valid": 10}]),
            "run",
        )
        self.assertEqual(report["format"], "jacoco")
        self.assertEqual(report["lineRate"], 0.5)
        self.assertEqual(report["files"]["com/example/Foo.java"]["covered"], 5)

    def test_invalid_xml_raises_with_label(self):
        with self.assertRaises(ValueError) as ctx:
            cdc.read_coverage("not xml", "baseline")
        self.assertIn("baseline", str(ctx.exception))


class CompareCoverage(unittest.TestCase):
    def test_drop_from_90_to_70_is_flagged(self):
        baseline = cobertura(9, 10, [{
            "filename": "app.py",
            "lines": [{"number": i + 1, "hits": 0 if i == 9 else 1} for i in range(10)],
        }])
        current = cobertura(7, 10, [{
            "filename": "app.py",
            "lines": [{"number": i + 1, "hits": 1 if i < 7 else 0} for i in range(10)],
        }])
        result = cdc.compare_coverage(baseline, current)
        self.assertTrue(result["overallDropped"])
        self.assertGreater(result["dropPct"], 19)
        self.assertLess(result["dropPct"], 21)
        self.assertEqual(result["droppedFiles"][0]["filename"], "app.py")
        status, _ = cdc.summarize_compare(result)
        self.assertEqual(status, "dropped")

    def test_max_drop_allows_a_small_drop(self):
        baseline = cobertura(10, 10, [{"filename": "app.py", "lines": [{"number": 1, "hits": 1}]}])
        current = cobertura(9, 10, [{"filename": "app.py", "lines": [{"number": 1, "hits": 1}]}])
        within = cdc.compare_coverage(baseline, current, max_drop_pct=15)
        self.assertFalse(within["overallDropped"])
        past = cdc.compare_coverage(baseline, current, max_drop_pct=0)
        self.assertTrue(past["overallDropped"])

    def test_improvement_is_not_a_drop(self):
        baseline = cobertura(1, 2, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}, {"number": 2, "hits": 0}]}])
        current = cobertura(2, 2, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}, {"number": 2, "hits": 1}]}])
        result = cdc.compare_coverage(baseline, current)
        self.assertFalse(result["overallDropped"])
        self.assertLess(result["dropPct"], 0)
        self.assertEqual(result["improvedFiles"][0]["filename"], "a.py")

    def test_new_and_removed_files_are_separate(self):
        baseline = cobertura(1, 1, [{"filename": "old.py", "lines": [{"number": 1, "hits": 1}]}])
        current = cobertura(1, 1, [{"filename": "new.py", "lines": [{"number": 1, "hits": 1}]}])
        result = cdc.compare_coverage(baseline, current)
        self.assertEqual(result["newFiles"][0]["filename"], "new.py")
        self.assertEqual(result["removedFiles"][0]["filename"], "old.py")
        self.assertEqual(result["droppedFiles"], [])


class MainCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def write(self, name, content):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        return path

    def test_exit_1_when_coverage_drops(self):
        a = self.write("base.xml", cobertura(10, 10, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}]}]))
        b = self.write("cur.xml", cobertura(5, 10, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}]}]))
        self.assertEqual(cdc.main([a, b]), 1)

    def test_exit_0_when_coverage_holds(self):
        xml = cobertura(10, 10, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}]}])
        a = self.write("base.xml", xml)
        b = self.write("cur.xml", xml)
        self.assertEqual(cdc.main([a, b]), 0)

    def test_exit_2_on_missing_files(self):
        self.assertEqual(cdc.main(["missing-a.xml", "missing-b.xml"]), 2)

    def test_json_output_is_valid_json(self):
        xml = cobertura(1, 1, [{"filename": "a.py", "lines": [{"number": 1, "hits": 1}]}])
        a = self.write("base.xml", xml)
        b = self.write("cur.xml", xml)
        proc = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "check.py"), a, b, "--json"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(proc.returncode, 0)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["overallDropped"])


if __name__ == "__main__":
    unittest.main()
