#!/usr/bin/env python3
"""Fail if a ventures/*-to-journal parser is silent when an amount splits a row.

A spreadsheet that writes 1,001.40 into an unquoted CSV splits that one field
in two and shifts every column after it. Red team 2026-11-15 found
payoneer-statement-to-journal reading the shifted Status cell ("157.10") as
"not completed" and dropping a $1,001.40 fee with only an info note, and
wash-sale-checker reading "buy,1,000,150.00" as 1 share at $0 with no error.

For each journal tool, column_shift_probe.mjs takes the tool's own sample
export, splits the first plain decimal amount that way, and requires a new
error or warning finding. A tool whose sample has no such amount, or that has
no single-argument parse function, is listed as skipped, not passed.

    python3 platform/ci/check_column_shift.py [--root DIR]   # exit 1 if any is silent
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = Path(__file__).resolve().with_name("column_shift_probe.mjs")


def probe(root):
    run = subprocess.run(["node", str(PROBE), str(root)], capture_output=True, text=True, timeout=300)
    if run.returncode != 0:
        raise RuntimeError(f"probe failed: {run.stderr.strip()[-400:]}")
    return [json.loads(line) for line in run.stdout.splitlines() if line.strip()]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args(argv)
    rows = probe(Path(args.root))
    silent = [r for r in rows if r["status"] == "silent"]
    skipped = [r for r in rows if r["status"] == "skip"]
    flagged = len(rows) - len(silent) - len(skipped)
    for r in silent:
        print(f"{r['file']}: line {r.get('line')} with {r['detail']} raised no error or warning; refuse a row with more fields than the header")
    print(f"column shift: {flagged} flagged, {len(silent)} silent, {len(skipped)} skipped ({', '.join(Path(r['file']).parent.name for r in skipped) or 'none'})")
    return 1 if silent else 0


if __name__ == "__main__":
    sys.exit(main())
