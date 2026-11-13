#!/usr/bin/env python3
"""Fail if a calculator's findings put a gain word in front of a negative amount.

Red team 2026-11-13 found three calculators (horse-boarding, campground,
pet-waste route) telling a user with a losing per-unit margin that "each
extra horse adds about -$270.00 a month; each empty stall costs you that"
(an empty stall saves it), and, at a margin of exactly $0.00, that each unit
"costs more than it brings in ($0.00)". A probe found three more ("Full-service
dogs add -$9", "the shop leaves -$1", "the lease nets -$3"). Each was a template
written for the profitable case.

`signed_gain_wording.mjs` imports every `ventures/*/calc.mjs` exporting
`SAMPLE` and `compute()`, runs the sample with each numeric field scaled by 0,
0.1, 0.5, 2 and 10, and reports the first finding that reads "adds/leaves/
earns/saves/nets ... -$N" or "costs more than ... ($0.00)".

    python3 platform/ci/check_signed_gain_wording.py [--root DIR]   # exit 1 on a hit
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCANNER = Path(__file__).resolve().parent / "signed_gain_wording.mjs"

# venture -> why its signed amount reads correctly.
ALLOW = {
    "injury-settlement-net-proceeds-calculator":
        "\"the client would net -$X\" on the other fee basis is a signed net: the client would owe.",
}


def scan(root):
    proc = subprocess.run(["node", str(SCANNER), str(root)], capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(f"scanner failed: {proc.stderr.strip()[-2000:]}")
    hits, scanned = [], 0
    for line in proc.stdout.splitlines():
        row = json.loads(line)
        if "scanned" in row:
            scanned = row["scanned"]
        else:
            hits.append(row)
    return hits, scanned


def failures(hits, allow=ALLOW):
    return [h for h in hits if h["venture"] not in allow]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    args = ap.parse_args(argv)
    hits, scanned = scan(args.root)
    bad = failures(hits)
    for h in bad:
        how = "the sample" if h["field"] is None else f"{h['field']} x {h['factor']}"
        print(f"ventures/{h['venture']}/calc.mjs: findings read {h['phrase']!r} on {how}. "
              "Word a loss as a loss (\"loses $N\"), or skip the gain line when the amount is not positive.")
    print(f"{scanned} calculator(s) probed; {len(bad)} put a gain word before a negative amount.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
