"""Read the Microsoft Project XML that msproject.mjs writes with MPXJ
(github.com/joniles/mpxj, an independent reader) and dump, per activity ID
(Text1), every text field MPXJ finds under its alias, so
eval/msproject-codes.mjs --mpxj can check that Project's field IDs and the
aliases land where msproject.mjs meant them to.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/msproject-codes-mpxj.py <file.xml> <out.json>"""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import TaskField  # noqa: E402

proj = UniversalProjectReader().read(sys.argv[1])
fields = proj.getCustomFields()
alias = {}
for n in range(1, 31):
    f = getattr(TaskField, "TEXT%d" % n)
    cf = fields.get(f)
    a = cf.getAlias() if cf is not None else None
    if a is not None:
        alias[n] = str(a)
out = {"aliases": {str(k): v for k, v in alias.items()}, "tasks": {}}
for t in proj.getTasks():
    aid = t.getText(1)
    if aid is None or t.getSummary():
        continue
    row = {}
    for n, a in alias.items():
        if n == 1:
            continue
        v = t.getText(n)
        if v is not None and str(v) != "":
            row[a] = str(v)
    out["tasks"][str(aid)] = row
json.dump(out, open(sys.argv[2], "w"))
print(sys.argv[1], len(out["tasks"]), "tasks,", len(alias), "named text fields")
