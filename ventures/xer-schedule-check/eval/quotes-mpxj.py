"""Names as MPXJ reads them, for the doubled-quote check (eval/quotes-2026-11-21.md).

MPXJ (github.com/joniles/mpxj) is an independent open-source reader of XER.
For each .xer given, print one JSON line per task, resource and WBS node:
{"file", "kind", "id", "name"}, where id is the activity ID, the resource ID
or the WBS short name, so eval/quotes-check.mjs can compare them with
parseXer's values.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/quotes-mpxj.py a.xer b.xer > mpxj-names.jsonl
"""
import json, os, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj.primavera import PrimaveraXERFileReader  # noqa: E402

for path in sys.argv[1:]:
    f = os.path.basename(path)
    r = PrimaveraXERFileReader()
    for p in r.readAll(path):
        for t in p.getTasks():
            name = t.getName()
            if name is None:
                continue
            aid = t.getActivityID()
            kind = "task" if aid is not None else "wbs"
            ident = str(aid) if aid is not None else str(t.getWBS() or "")
            print(json.dumps({"file": f, "kind": kind, "id": ident, "name": str(name)}, ensure_ascii=False))
        for res in p.getResources():
            if res.getName() is None:
                continue
            print(json.dumps({"file": f, "kind": "resource", "id": str(res.getResourceID() or ""), "name": str(res.getName())}, ensure_ascii=False))
