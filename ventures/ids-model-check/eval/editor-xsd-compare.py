#!/usr/bin/env python3
"""Does opening an IDS in the editor and writing it back change whether it is
valid against buildingSMART's ids.xsd?

    pip install ifctester
    node eval/editor-open.mjs --write /tmp/editor-open
    python3 eval/editor-xsd-compare.py /tmp/editor-open

For each N.orig.ids / N.back.ids pair, opens both with IfcTester
(ifctester.ids.open(path, validate=True)). Counts: valid before and after,
made valid, made invalid. Exit 1 if writing back made any valid file invalid.
"""
import glob
import os
import sys

from ifctester import ids as idsmod


def valid(path):
    try:
        idsmod.open(path, validate=True)
        return True, ""
    except Exception as e:  # noqa: BLE001 - any validation or read failure
        return False, str(e).splitlines()[0][:300] if str(e) else type(e).__name__


d = sys.argv[1]
groups = {}
broke = []
for orig in sorted(glob.glob(os.path.join(d, "*.orig.ids"))):
    k = orig[: -len(".orig.ids")]
    name = open(k + ".name").read().strip()
    group = name.split("/")[1] if name.startswith("corpus/") else "IDS test cases"
    vo, _ = valid(orig)
    vb, why = valid(k + ".back.ids")
    g = groups.setdefault(group, [0, 0, 0, 0, 0])
    g[0] += 1
    g[1] += vo
    g[2] += vb
    g[3] += vb and not vo
    if vo and not vb:
        g[4] += 1
        broke.append(f"{name}: {why}")
for group, (n, vo, vb, fixed, broken) in groups.items():
    print(f"{group}: {n} files; valid against ids.xsd before {vo}, after writing back {vb} (made valid {fixed}, made invalid {broken})")
for b in broke:
    print("  made invalid:", b)
sys.exit(1 if broke else 0)
