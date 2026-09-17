#!/usr/bin/env python3
"""Find flaky tests across two or more JUnit-XML test reports.

    python3 check.py run1.xml run2.xml run3.xml
    python3 check.py --glob "reports/*.xml"
    python3 check.py run1.xml run2.xml --json

A flaky test is one that failed in some runs and passed in others -- a fact
about the reports themselves, decided without a model or a guess. This tool
reads any file JUnit-XML's `<testcase>`/`<failure>`/`<error>`/`<skipped>`
shape (pytest, jest via jest-junit, go-junit-report, PHPUnit, RSpec's
RSpecJUnitFormatter, and Maven/Gradle Surefire/Failsafe all produce it),
groups occurrences of the same test by `classname::name`, and reports three
buckets:

  - **flaky**   -- passed in at least one run and failed in at least one
                   other (or a Surefire/Failsafe `<flakyFailure>`/
                   `<flakyError>` element says so directly).
  - **broken**  -- failed in every run it appeared in. Not flaky -- a real,
                   consistent failure.
  - **stable**  -- passed in every run it appeared in.

A test does not have to appear in every file to be classified. The single
most common real shape is a CI job that reruns only the tests that failed
the first time (pytest --lf, jest --onlyFailures, most "retry failed tests"
CI features), so a later run legitimately contains a strict subset of the
first run's tests -- that is not a missing test, it is the retry itself.

Exit status: 0 if no test was found flaky, 1 if at least one was (nothing
here is your fault to fix in the product code -- it is the test or its
environment), 2 on a usage or parse error.
"""

import argparse
import glob as glob_module
import json
import sys
import xml.etree.ElementTree as ET

FLAKY_TAGS = {"flakyFailure", "flakyError", "rerunFailure", "rerunError"}


def read_testcases(xml_text, label):
    """Yield {classname, name, key, status, message, rerun_signal} per <testcase>."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"{label}: not valid XML ({exc})") from exc

    for node in root.iter("testcase"):
        classname = node.get("classname") or node.get("class") or ""
        name = node.get("name") or "(unnamed test)"
        status = "passed"
        message = None
        rerun_signal = False
        for child in node:
            tag = child.tag
            if tag in ("failure", "error"):
                status = "failed"
                message = message or child.get("message")
            elif tag == "skipped" and status != "failed":
                status = "skipped"
            elif tag in FLAKY_TAGS:
                rerun_signal = True
        yield {
            "classname": classname,
            "name": name,
            "key": f"{classname}::{name}" if classname else name,
            "status": status,
            "message": message,
            "rerun_signal": rerun_signal,
        }


def classify_runs(runs):
    """runs: list of {"label": str, "xml": str}. Returns rows, worst-first."""
    if not runs:
        raise ValueError("give at least one run's JUnit XML")

    by_key = {}
    for index, run in enumerate(runs):
        label = run.get("label") or f"run {index + 1}"
        for tc in read_testcases(run["xml"], label):
            # Keep identity separate from the ambiguous "classname::name" label.
            identity = (tc["classname"], tc["name"])
            entry = by_key.setdefault(
                identity, {"classname": tc["classname"], "name": tc["name"], "key": tc["key"], "occurrences": []}
            )
            entry["occurrences"].append(
                {"run": label, "status": tc["status"], "message": tc["message"], "rerun_signal": tc["rerun_signal"]}
            )

    rank = {"flaky": 0, "broken": 1, "skipped-only": 2, "stable": 3}
    rows = []
    for entry in by_key.values():
        occ = entry["occurrences"]
        passed = sum(1 for o in occ if o["status"] == "passed")
        failed = sum(1 for o in occ if o["status"] == "failed")
        skipped = sum(1 for o in occ if o["status"] == "skipped")
        seen_in_runs = len({o["run"] for o in occ})
        rerun_signal = any(o["rerun_signal"] for o in occ)
        failure_message = next((o["message"] for o in occ if o["status"] == "failed"), None)

        if rerun_signal or (passed > 0 and failed > 0):
            verdict = "flaky"
        elif failed > 0:
            verdict = "broken"
        elif passed > 0:
            verdict = "stable"
        else:
            verdict = "skipped-only"

        rows.append(
            {
                "classname": entry["classname"],
                "name": entry["name"],
                "key": entry["key"],
                "passed": passed,
                "failed": failed,
                "skipped": skipped,
                "seen_in_runs": seen_in_runs,
                "total_runs": len(runs),
                "verdict": verdict,
                "failure_message": failure_message,
            }
        )

    rows.sort(key=lambda r: (rank[r["verdict"]], r["key"]))
    return rows


def summarize(rows, total_runs):
    flaky = [r for r in rows if r["verdict"] == "flaky"]
    broken = [r for r in rows if r["verdict"] == "broken"]
    stable = [r for r in rows if r["verdict"] == "stable"]

    if flaky:
        return f"{len(flaky)} of {len(rows)} test(s) flipped between pass and fail — that is flakiness, not a real regression by itself."
    if broken:
        low_confidence = " (only one run given — rerun to be sure before trusting this)" if total_runs < 2 else ""
        return f"No flakiness found. {len(broken)} test(s) failed every time they ran{low_confidence} — that reads as a real, consistent failure."
    return f"No flakiness and no consistent failures found. All {len(stable)} test(s) passed every time they ran."


def render(rows, total_runs):
    lines = [summarize(rows, total_runs), ""]
    marks = {"flaky": "??", "broken": "!!", "stable": "ok", "skipped-only": "--"}
    for row in rows:
        if row["verdict"] == "stable":
            continue
        mark = marks.get(row["verdict"], "  ")
        detail = f"{row['passed']}p/{row['failed']}f/{row['skipped']}s across {row['seen_in_runs']}/{row['total_runs']} run(s)"
        lines.append(f"  {mark}  {row['key']}  [{row['verdict']}]  {detail}")
        if row["failure_message"]:
            lines.append(f"        {row['failure_message']}")
    stable_count = sum(1 for r in rows if r["verdict"] == "stable")
    if stable_count:
        lines.append(f"\n({stable_count} stable test(s) not shown — pass --json for the full list.)")
    return "\n".join(lines)


def collect_paths(args):
    paths = list(args.files)
    for pattern in args.glob or []:
        matched = sorted(glob_module.glob(pattern, recursive=True))
        if not matched:
            raise ValueError(f"--glob {pattern!r} matched no files")
        paths.extend(matched)
    if not paths:
        raise ValueError("give one or more JUnit XML files, or --glob a pattern")
    return paths


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("files", nargs="*", help="JUnit XML report files, one per run")
    parser.add_argument("--glob", action="append", help="a glob pattern for report files (repeatable)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    try:
        paths = collect_paths(args)
        runs = []
        for path in paths:
            with open(path, encoding="utf-8") as handle:
                runs.append({"label": path, "xml": handle.read()})
        rows = classify_runs(runs)
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"runs": len(runs), "rows": rows}, indent=2))
    else:
        print(render(rows, len(runs)))

    return 1 if any(r["verdict"] == "flaky" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
