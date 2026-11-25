"""Does IfcTester return on a model with a cycle of wholes?

eval/decomposition-cycles-2026-11-24.md. Reads the manifest that
eval/decomposition-cycles.mjs writes and, for each seeded file and its
original, checks two specifications with IfcTester in a child process under a
time limit: every record of the part's class and of the whole's class must be
part of an IFCPROJECTLIBRARY (a class no chain of wholes reaches, so the walk
has to climb to the top to answer), once through the family's relationship
and once with no relationship named.

    python eval/decomposition_cycles_ifctester.py OUTDIR/manifest.json [--timeout 60] [--jobs 4]

Prints one line per file: seconds, or HUNG when the limit passed.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

CHILD = r"""
import sys, ifcopenshell, ifctester.ids
m = ifcopenshell.open(sys.argv[1]); s = ifctester.ids.open(sys.argv[2]); s.validate(m)
print(sum(len(x.failed_entities) for x in s.specifications))
"""

IDS = """<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
<info><title>cycle probe</title></info><specifications>{specs}</specifications></ids>"""
SPEC = """<specification name="{name}" ifcVersion="{ver}"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><xs:restriction base="xs:string"><xs:enumeration value="{a}"/><xs:enumeration value="{b}"/></xs:restriction></name></entity></applicability>
<requirements><partOf{rel} cardinality="required"><entity><name><simpleValue>IFCPROJECTLIBRARY</simpleValue></name></entity></partOf></requirements></specification>"""
VER = {"IFC2X3": "IFC2X3", "IFC4": "IFC4", "IFC4X3": "IFC4X3_ADD2"}


def ids_for(entry, d):
    rel = "IFCRELNESTS" if entry["family"] == "nest-cycle" else "IFCRELAGGREGATES"
    kw = dict(ver=VER[entry["schema"]], a=entry["partType"], b=entry["wholeType"])
    specs = SPEC.format(name="via " + rel, rel=f' relation="{rel}"', **kw) + SPEC.format(name="any relation", rel="", **kw)
    path = os.path.join(d, f"{os.path.basename(entry['seeded'])}.ids")
    with open(path, "w") as f:
        f.write(IDS.format(specs=specs))
    return path


def run(model, ids, timeout):
    t = time.time()
    try:
        p = subprocess.run([sys.executable, "-I", "-c", CHILD, model, ids], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "HUNG", None
    if p.returncode:
        return "ERROR", p.stderr.strip().splitlines()[-1:] or [""]
    return f"{time.time() - t:.1f}s", p.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--timeout", type=float, default=60)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    entries = json.load(open(a.manifest))
    d = tempfile.mkdtemp()

    def one(e):
        ids = ids_for(e, d)
        o = run(e["original"], ids, a.timeout)
        s = run(e["seeded"], ids, a.timeout)
        return e, o, s

    tally = {}
    with ThreadPoolExecutor(a.jobs) as ex:
        for e, o, s in ex.map(one, entries):
            t = tally.setdefault(e["family"], {"files": 0, "orig_hung": 0, "seeded_hung": 0, "errors": 0})
            t["files"] += 1
            t["orig_hung"] += o[0] == "HUNG"
            t["seeded_hung"] += s[0] == "HUNG"
            t["errors"] += "ERROR" in (o[0], s[0])
            print(f"{os.path.basename(e['seeded'])}: original {o[0]} ({o[1]} failed), seeded {s[0]}" + (f" ({s[1]} failed)" if s[1] is not None else ""), flush=True)
    print("\nfamily              files  original-hung  seeded-hung  errors")
    for k, v in tally.items():
        print(f"{k:<19} {v['files']:>5} {v['orig_hung']:>14} {v['seeded_hung']:>12} {v['errors']:>7}")


if __name__ == "__main__":
    main()
