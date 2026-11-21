"""Read the Microsoft Project XML that msproject.mjs writes with outline codes
(--outline-codes) using MPXJ (github.com/joniles/mpxj, an independent
reader), and dump each Outline Code field's alias and lookup table (value,
description, parent value) and every task's value by activity ID (Text1), so
eval/msproject-outline.mjs --mpxj can check them against what was written.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/msproject-outline-mpxj.py <file.xml> <out.json>"""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import TaskField  # noqa: E402

proj = UniversalProjectReader().read(sys.argv[1])
fields = proj.getCustomFields()
out = {"mpxj": str(mpxj.__version__) if hasattr(mpxj, "__version__") else None, "fields": {}, "tasks": {}}
for n in range(1, 11):
    cf = fields.get(getattr(TaskField, "OUTLINE_CODE%d" % n))
    if cf is None or cf.getAlias() is None:
        continue
    items = list(cf.getLookupTable())
    byId = {int(i.getUniqueID()): i for i in items}
    vals = []
    for i in items:
        p = i.getParentUniqueID()
        vals.append({"value": str(i.getValue()), "description": str(i.getDescription() or ""),
                     "parent": str(byId[int(p)].getValue()) if p is not None and int(p) in byId else None})
    out["fields"][str(n)] = {"alias": str(cf.getAlias()), "values": vals,
                             "masks": [str(m.getSeparator()) for m in cf.getMasks()]}
for t in proj.getTasks():
    aid = t.getText(1)
    if aid is None or t.getSummary():
        continue
    row = {}
    for n in out["fields"]:
        v = t.get(getattr(TaskField, "OUTLINE_CODE%s" % n))
        if v is not None and str(v) != "":
            row[n] = str(v)
    out["tasks"][str(aid)] = row
json.dump(out, open(sys.argv[2], "w"))
print(sys.argv[1], len(out["tasks"]), "tasks,", len(out["fields"]), "outline code fields")
