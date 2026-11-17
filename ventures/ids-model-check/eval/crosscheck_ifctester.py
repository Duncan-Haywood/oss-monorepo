#!/usr/bin/env python3
"""Compare this checker with IfcOpenShell's IfcTester on real models.

    pip install ifctester ifcopenshell
    (install a matching pair: ifctester 0.8.0 crashes with ifcopenshell
    0.9.0.post1 ("no attribute 'wrapped_data'") and runs with ifcopenshell
    0.8.5; eval/untyped-values-2026-11-17.md)
    python3 eval/crosscheck_ifctester.py SPEC.ids MODEL.ifc [MODEL.ifc ...]

For each model and specification, prints IfcTester's verdict and failing
element ids next to this checker's (run through `node cli.mjs --json`), and the
elements on which they disagree. Exit 1 if any verdict or failing set differs.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import ifcopenshell
from ifctester import ids as idsmod

HERE = Path(__file__).resolve().parent.parent


def ifctester_run(ids_path, model_path):
    spec = idsmod.open(str(ids_path))
    t0 = time.time()
    model = ifcopenshell.open(str(model_path))
    spec.validate(model)
    secs = time.time() - t0
    out = []
    for s in spec.specifications:
        failed = set()
        for r in s.requirements:
            for f in getattr(r, "failures", []) or []:
                el = f.get("element") if isinstance(f, dict) else None
                if el is not None and hasattr(el, "id"):
                    failed.add(el.id())
        if s.maxOccurs == 0:
            failed = {e.id() for e in s.applicable_entities}
        out.append({"name": s.name, "pass": bool(s.status), "applicable": len(s.applicable_entities), "failed": failed})
    return out, secs


def ours_run(ids_path, model_path):
    t0 = time.time()
    p = subprocess.run(["node", str(HERE / "cli.mjs"), str(model_path), str(ids_path), "--json"], capture_output=True, text=True)
    secs = time.time() - t0
    if p.returncode == 2:
        raise RuntimeError(p.stderr)
    rep = json.loads(p.stdout)
    return [{"name": s["name"], "pass": s["status"] == "pass", "applicable": s["applicable"], "failed": {f["id"] for f in s["failed"]}} for s in rep["specs"]], secs


def main():
    ids_path = Path(sys.argv[1])
    bad = 0
    for m in sys.argv[2:]:
        theirs, t1 = ifctester_run(ids_path, m)
        ours, t2 = ours_run(ids_path, m)
        print(f"== {Path(m).name}: IfcTester {t1:.1f} s, ids-model-check {t2:.1f} s (wall clock, including start-up)")
        for a, b in zip(theirs, ours):
            same = a["pass"] == b["pass"] and a["applicable"] == b["applicable"] and a["failed"] == b["failed"]
            bad += not same
            print(f"  {'same' if same else 'DIFF'}  {a['name']}: IfcTester {'pass' if a['pass'] else 'fail'} ({a['applicable']} applicable, {len(a['failed'])} failing) | ours {'pass' if b['pass'] else 'fail'} ({b['applicable']} applicable, {len(b['failed'])} failing)")
            if not same:
                only_t = sorted(a["failed"] - b["failed"])[:10]
                only_o = sorted(b["failed"] - a["failed"])[:10]
                if only_t:
                    print(f"      failing only in IfcTester: {only_t}")
                if only_o:
                    print(f"      failing only in ours: {only_o}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
