#!/usr/bin/env python3
"""Fail on CSV header lookups that ignore the order of their alias list.

Ventures read pasted exports by trying a list of header aliases, most specific
first: ["service", "service_name", "service_id"], ["ended at", ..., "canceled
at"]. The idiom `head.findIndex((h) => names.includes(h))` returns the
*leftmost column* naming any alias, so the list's order means nothing and the
export's column order decides. A red-team run on 2026-11-15 found it in 20
files: oncall-load-analyzer grouped a PagerDuty-style export (service_id before
service_name) under opaque ids, and mrr-pulse dated churn at a Stripe export's
Canceled At (the day the customer asked) instead of its later Ended At (the
day the revenue stopped), a month early.

The priority-order form is

    names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1

A lookup that really means "any of these, wherever it is" says so in a
comment containing `alias-order: any` on the same line.

    python3 platform/ci/check_alias_priority.py [ventures-dir]   exit 1 on a hit
"""
import os
import re
import sys
from pathlib import Path

PATTERN = re.compile(r"(?<=[\w)])\.findIndex\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*[\w.]+\.includes\(\s*\1\s*\)\s*\)")
EXTS = (".mjs", ".js", ".ts", ".cjs", ".tsx", ".jsx")
SKIP_DIRS = {"node_modules", "dist", "build", ".git", "vendor", "_site"}
OPT_OUT = "alias-order: any"


def is_test(name):
    return ".test." in name or name.endswith(".check.mjs") or name.startswith("test_")


def scan_text(text):
    """Return 1-based line numbers of order-blind alias lookups."""
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        if PATTERN.search(line) and OPT_OUT not in line:
            hits.append(n)
    return hits


def check_tree(root):
    problems = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.endswith(EXTS) or is_test(name) or ".min." in name:
                continue
            path = Path(dirpath) / name
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if "findIndex" not in text:
                continue
            for line in scan_text(text):
                problems.append(f"{path}:{line}: findIndex((h) => names.includes(h)) picks the leftmost column, not the first alias; use names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1")
    return problems


def main(argv):
    root = argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[2] / "ventures"
    problems = check_tree(root)
    for p in problems:
        print(p)
    if problems:
        print(f"{len(problems)} order-blind alias lookup(s); see platform/ci/check_alias_priority.py")
        return 1
    print("alias lookups: all in priority order")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
