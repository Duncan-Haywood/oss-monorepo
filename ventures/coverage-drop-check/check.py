#!/usr/bin/env python3
"""Compare two coverage XML reports and fail if line coverage dropped.

    python3 check.py baseline.xml current.xml
    python3 check.py baseline.xml current.xml --max-drop 0.5
    python3 check.py baseline.xml current.xml --json

Reads Cobertura XML (coverage.py, pytest-cov, nyc/Istanbul --reporter=cobertura)
or JaCoCo XML. A drop is measured in percentage points of line coverage
(baseline rate minus current rate), not against a fixed floor — so a PR that
moves 92% → 81% fails even though both numbers are "above 80".

Exit status: 0 if the overall drop is within --max-drop (default 0), 1 if it
exceeded the allowance, 2 on a usage or parse error.
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET


def _line_rate(covered, valid):
    if not valid:
        return 0.0
    return covered / valid


def _file_record(filename, covered, valid):
    return {
        "filename": filename,
        "covered": covered,
        "valid": valid,
        "lineRate": _line_rate(covered, valid),
    }


def _local_tag(tag):
    if tag and "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _iter(node, name):
    for child in node.iter():
        if _local_tag(child.tag) == name:
            yield child


def _first(node, name):
    if _local_tag(node.tag) == name:
        return node
    for child in node.iter():
        if _local_tag(child.tag) == name:
            return child
    return None


def read_coverage(xml_text, label):
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"{label}: not valid XML ({exc})") from exc

    coverage = _first(root, "coverage")
    if coverage is not None:
        return _from_cobertura(coverage)
    report = _first(root, "report")
    if report is not None:
        return _from_jacoco(root if _local_tag(root.tag) == "report" else report)
    raise ValueError(
        f"{label}: no coverage root — give a Cobertura (coverage.py, pytest-cov, nyc) or JaCoCo XML report"
    )


def _from_cobertura(coverage):
    files = {}
    for cls in _iter(coverage, "class"):
        filename = cls.get("filename") or cls.get("name") or "(unnamed)"
        covered = 0
        valid = 0
        for lines in cls:
            if _local_tag(lines.tag) != "lines":
                continue
            for line in lines:
                if _local_tag(line.tag) != "line":
                    continue
                valid += 1
                if float(line.get("hits") or 0) > 0:
                    covered += 1
        if filename in files:
            prev = files[filename]
            files[filename] = _file_record(
                filename, prev["covered"] + covered, prev["valid"] + valid
            )
        else:
            files[filename] = _file_record(filename, covered, valid)

    attr_covered = coverage.get("lines-covered")
    attr_valid = coverage.get("lines-valid")
    summed_covered = sum(f["covered"] for f in files.values())
    summed_valid = sum(f["valid"] for f in files.values())
    if attr_covered is not None and attr_valid is not None and float(attr_valid) > 0:
        covered = float(attr_covered)
        valid = float(attr_valid)
    else:
        covered = summed_covered
        valid = summed_valid
    return {
        "format": "cobertura",
        "covered": covered,
        "valid": valid,
        "lineRate": _line_rate(covered, valid),
        "files": files,
    }


def _jacoco_line_counter(node):
    for child in node:
        if _local_tag(child.tag) == "counter" and (child.get("type") or "").upper() == "LINE":
            covered = float(child.get("covered") or 0)
            missed = float(child.get("missed") or 0)
            return {"covered": covered, "valid": covered + missed}
    return None


def _from_jacoco(report):
    # Build parent map so a <sourcefile> can inherit its <package> path.
    parent = {child: node for node in report.iter() for child in node}

    files = {}
    for source in _iter(report, "sourcefile"):
        prefix = ""
        node = source
        while node in parent:
            node = parent[node]
            if _local_tag(node.tag) == "package":
                name = node.get("name") or ""
                prefix = f"{name.replace('.', '/')}/" if name else ""
                break
        filename = f"{prefix}{source.get('name') or '(unnamed)'}"
        counter = _jacoco_line_counter(source)
        if counter:
            covered, valid = counter["covered"], counter["valid"]
        else:
            covered = 0
            valid = 0
            for line in source:
                if _local_tag(line.tag) != "line":
                    continue
                valid += 1
                if float(line.get("ci") or 0) > 0:
                    covered += 1
        if filename in files:
            prev = files[filename]
            files[filename] = _file_record(
                filename, prev["covered"] + covered, prev["valid"] + valid
            )
        else:
            files[filename] = _file_record(filename, covered, valid)

    report_counter = _jacoco_line_counter(report)
    summed_covered = sum(f["covered"] for f in files.values())
    summed_valid = sum(f["valid"] for f in files.values())
    if report_counter:
        covered, valid = report_counter["covered"], report_counter["valid"]
    else:
        covered, valid = summed_covered, summed_valid
    return {
        "format": "jacoco",
        "covered": covered,
        "valid": valid,
        "lineRate": _line_rate(covered, valid),
        "files": files,
    }


def compare_coverage(baseline_xml, current_xml, max_drop_pct=0):
    max_drop_pct = float(max_drop_pct)
    if max_drop_pct < 0 or max_drop_pct != max_drop_pct:
        raise ValueError("--max-drop must be a non-negative number of percentage points")
    baseline = read_coverage(baseline_xml, "baseline")
    current = read_coverage(current_xml, "current")
    drop_pct = (baseline["lineRate"] - current["lineRate"]) * 100
    names = set(baseline["files"]) | set(current["files"])
    files = []
    for filename in names:
        before = baseline["files"].get(filename)
        after = current["files"].get(filename)
        if before is None:
            files.append({
                "filename": filename,
                "verdict": "new",
                "baselineRate": None,
                "currentRate": after["lineRate"],
                "dropPct": None,
                "baselineCovered": 0,
                "currentCovered": after["covered"],
                "baselineValid": 0,
                "currentValid": after["valid"],
            })
            continue
        if after is None:
            files.append({
                "filename": filename,
                "verdict": "removed",
                "baselineRate": before["lineRate"],
                "currentRate": None,
                "dropPct": None,
                "baselineCovered": before["covered"],
                "currentCovered": 0,
                "baselineValid": before["valid"],
                "currentValid": 0,
            })
            continue
        file_drop = (before["lineRate"] - after["lineRate"]) * 100
        if file_drop > 1e-9:
            verdict = "dropped"
        elif file_drop < -1e-9:
            verdict = "improved"
        else:
            verdict = "unchanged"
        files.append({
            "filename": filename,
            "verdict": verdict,
            "baselineRate": before["lineRate"],
            "currentRate": after["lineRate"],
            "dropPct": file_drop,
            "baselineCovered": before["covered"],
            "currentCovered": after["covered"],
            "baselineValid": before["valid"],
            "currentValid": after["valid"],
        })
    rank = {"dropped": 0, "removed": 1, "new": 2, "improved": 3, "unchanged": 4}
    files.sort(key=lambda f: (
        rank[f["verdict"]],
        -(f["dropPct"] if f["dropPct"] is not None else float("-inf")),
        f["filename"],
    ))
    overall_dropped = drop_pct > max_drop_pct + 1e-9
    return {
        "baseline": {
            "format": baseline["format"],
            "covered": baseline["covered"],
            "valid": baseline["valid"],
            "lineRate": baseline["lineRate"],
        },
        "current": {
            "format": current["format"],
            "covered": current["covered"],
            "valid": current["valid"],
            "lineRate": current["lineRate"],
        },
        "dropPct": drop_pct,
        "maxDropPct": max_drop_pct,
        "overallDropped": overall_dropped,
        "files": files,
        "droppedFiles": [f for f in files if f["verdict"] == "dropped"],
        "improvedFiles": [f for f in files if f["verdict"] == "improved"],
        "newFiles": [f for f in files if f["verdict"] == "new"],
        "removedFiles": [f for f in files if f["verdict"] == "removed"],
    }


def summarize_compare(result):
    base_pct = result["baseline"]["lineRate"] * 100
    curr_pct = result["current"]["lineRate"] * 100
    drop = result["dropPct"]
    if result["overallDropped"]:
        return (
            "dropped",
            f"Line coverage dropped {drop:.2f} points ({base_pct:.2f}% → {curr_pct:.2f}%), "
            f"past the {result['maxDropPct']} point allowance. "
            f"{len(result['droppedFiles'])} file(s) got worse.",
        )
    if drop > 1e-9:
        return (
            "ok",
            f"Line coverage dropped {drop:.2f} points ({base_pct:.2f}% → {curr_pct:.2f}%), "
            f"within the {result['maxDropPct']} point allowance.",
        )
    if drop < -1e-9:
        return (
            "improved",
            f"Line coverage rose {-drop:.2f} points ({base_pct:.2f}% → {curr_pct:.2f}%).",
        )
    return ("ok", f"Line coverage is unchanged at {curr_pct:.2f}%.")


def _print_human(result):
    status, text = summarize_compare(result)
    print(text)
    interesting = [f for f in result["files"] if f["verdict"] != "unchanged"]
    if not interesting:
        return status
    print()
    for row in interesting:
        if row["verdict"] == "dropped":
            print(
                f"  dropped   {row['filename']}  "
                f"{row['baselineRate'] * 100:.1f}% → {row['currentRate'] * 100:.1f}%  "
                f"(-{row['dropPct']:.1f} pts)"
            )
        elif row["verdict"] == "improved":
            print(
                f"  improved  {row['filename']}  "
                f"{row['baselineRate'] * 100:.1f}% → {row['currentRate'] * 100:.1f}%"
            )
        elif row["verdict"] == "new":
            print(f"  new       {row['filename']}  {row['currentRate'] * 100:.1f}%")
        elif row["verdict"] == "removed":
            print(f"  removed   {row['filename']}  was {row['baselineRate'] * 100:.1f}%")
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", help="coverage XML from the baseline (main, last release)")
    parser.add_argument("current", help="coverage XML from this PR or commit")
    parser.add_argument(
        "--max-drop",
        type=float,
        default=0,
        metavar="POINTS",
        help="allowed drop in percentage points (default 0 — any drop fails)",
    )
    parser.add_argument("--json", action="store_true", help="print the comparison as JSON")
    args = parser.parse_args(argv)

    try:
        with open(args.baseline, encoding="utf-8") as handle:
            baseline_xml = handle.read()
        with open(args.current, encoding="utf-8") as handle:
            current_xml = handle.read()
        result = compare_coverage(baseline_xml, current_xml, max_drop_pct=args.max_drop)
    except OSError as exc:
        print(exc, file=sys.stderr)
        return 2
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        _print_human(result)
    return 1 if result["overallDropped"] else 0


if __name__ == "__main__":
    sys.exit(main())
