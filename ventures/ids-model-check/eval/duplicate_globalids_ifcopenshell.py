"""Independent count of duplicate GlobalIds with IfcOpenShell, to compare with
eval/duplicate-globalids.mjs (eval/duplicate-globalids-2026-11-17.md).

    pip install ifcopenshell==0.9.0.post1
    python3 eval/duplicate_globalids_ifcopenshell.py DIR [DIR...]

One JSON line per .ifc file: the GlobalIds that more than one IfcRoot instance
holds, each with its instances' #ids, or the error IfcOpenShell raised.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import ifcopenshell

for d in sys.argv[1:]:
    for p in sorted(Path(d).rglob("*")):
        if ".git" in p.parts or p.suffix.lower() != ".ifc":
            continue
        try:
            f = ifcopenshell.open(str(p))
            by = defaultdict(list)
            for e in f.by_type("IfcRoot"):
                g = e.GlobalId
                if g:
                    by[g].append(e.id())
            dups = {g: sorted(ids) for g, ids in by.items() if len(ids) > 1}
            print(json.dumps({"file": str(p), "dupGids": len(dups), "dups": dict(sorted(dups.items()))}))
        except Exception as e:  # noqa: BLE001 - report and go on
            print(json.dumps({"file": str(p), "error": str(e)[:120]}))
