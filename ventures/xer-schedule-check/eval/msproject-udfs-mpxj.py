"""Read the Microsoft Project XML that msproject.mjs writes with MPXJ
(github.com/joniles/mpxj, an independent reader) and dump, per activity ID
(Text1), every Number, Cost, Date and Text field MPXJ finds under a custom
field definition, keyed by the field's name (Number3, Cost1, Date2, Text26),
plus each field's alias, so eval/msproject-udfs.mjs --mpxj can check that
Project's field IDs, the aliases and the value forms (costs in hundredths)
land where msproject.mjs meant them to.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/msproject-udfs-mpxj.py <file.xml> <out.json>"""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import TaskField  # noqa: E402

proj = UniversalProjectReader().read(sys.argv[1])
fields = proj.getCustomFields()
KINDS = [("Number", "NUMBER", 20), ("Cost", "COST", 10), ("Date", "DATE", 10), ("Text", "TEXT", 30)]
named = []
aliases = {}
for label, attr, n in KINDS:
    for i in range(1, n + 1):
        f = getattr(TaskField, "%s%d" % (attr, i))
        cf = fields.get(f)
        a = cf.getAlias() if cf is not None else None
        if a is not None:
            aliases["%s%d" % (label, i)] = str(a)
            named.append(("%s%d" % (label, i), f))


def fmt(v):
    if v is None:
        return None
    s = str(v)
    if hasattr(v, "getYear") and hasattr(v, "getHour"):  # LocalDateTime
        return "%04d-%02d-%02dT%02d:%02d" % (v.getYear(), v.getMonthValue(), v.getDayOfMonth(), v.getHour(), v.getMinute())
    try:
        return float(s) if label_numeric(v) else s
    except ValueError:
        return s


def label_numeric(v):
    return isinstance(v, (int, float)) or "Double" in type(v).__name__ or "Number" in type(v).__name__ or "Integer" in type(v).__name__


out = {"aliases": aliases, "tasks": {}}
for t in proj.getTasks():
    aid = t.getText(1)
    if aid is None or t.getSummary():
        continue
    row = {}
    for name, f in named:
        if name == "Text1":
            continue
        v = t.getCachedValue(f)
        if v is None or str(v) == "":
            continue
        row[name] = fmt(v)
    out["tasks"][str(aid)] = row
json.dump(out, open(sys.argv[2], "w"))
print(sys.argv[1], len(out["tasks"]), "tasks,", len(aliases), "named custom fields")
