"""Read, with MPXJ (github.com/joniles/mpxj, an independent reader), the
Microsoft Project XML msproject.mjs writes and the XER p6xer.mjs makes from it
again, and dump every task custom field MPXJ finds (on summary tasks, the WBS nodes,
in the XER):

- xml: each task Text, Number, Cost and Date field with an alias
  (aliases: {Number3: title}) and its value per summary task, keyed by its
  UID (cells: {"12": {Number3: value}});
- xer: each field MPXJ maps a WBS UDF to, keyed by the UDF's title, per WBS
  node, keyed by its WBS code path (cells: {"1.2.3": {title: value}}).

eval/wbs-udfs.mjs --mpxj then checks both against what was meant.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/wbs-udfs-mpxj.py <file.xml> <file.back.xer> <out.json>"""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import FieldTypeClass  # noqa: E402
JNumber = jpype.JClass("java.lang.Number")


def fmt(v):
    if v is None:
        return None
    if hasattr(v, "getYear") and hasattr(v, "getHour"):  # LocalDateTime
        return "%04d-%02d-%02dT%02d:%02d" % (v.getYear(), v.getMonthValue(), v.getDayOfMonth(), v.getHour(), v.getMinute())
    if isinstance(v, JNumber):
        return float(str(v))
    return str(v)


def code(t, xer, prefix):
    if not xer:
        return str(t.getUniqueID())  # the XML's summary task UID
    # MPXJ gives a P6 WBS node the project's code and the node's path of codes
    w = str(t.getWBS())
    return w[len(prefix):] if w.startswith(prefix) else w


def dump(path, xer):
    proj = UniversalProjectReader().read(path)
    prefix = str(proj.getProjectProperties().getProjectID()) + "."
    fields = []
    for cf in proj.getCustomFields():
        f = cf.getFieldType()
        if f is None or f.getFieldTypeClass() != FieldTypeClass.TASK or cf.getAlias() is None:
            continue
        fields.append((str(f.name()).title().replace("_", ""), str(cf.getAlias()), f))
    aliases = {n: a for n, a, _ in fields}
    cells = {}
    plain = set()
    for t in proj.getTasks():
        if t.getUniqueID() is None or int(str(t.getUniqueID())) == 0:
            continue
        # in the XML every task is read (keyed by UID): MPXJ, like Project,
        # makes a summary task with no children a plain task
        if xer and not t.getSummary():
            continue
        if not xer and not t.getSummary():
            plain.add(str(t.getUniqueID()))
        row = {}
        for n, a, f in fields:
            v = fmt(t.getCachedValue(f))
            if v is not None and v != "":
                row[a if xer else n] = v
        if row:
            cells[code(t, xer, prefix)] = row
    return {"aliases": aliases, "cells": cells, "plain": sorted(plain, key=int)}


out = {"xml": dump(sys.argv[1], False), "xer": dump(sys.argv[2], True)}
with open(sys.argv[3], "w") as fh:
    json.dump(out, fh, indent=1)
print(sys.argv[1], len(out["xml"]["aliases"]), "aliased XML fields;", sum(len(v) for v in out["xml"]["cells"].values()), "XML task cells;", sum(len(v) for v in out["xer"]["cells"].values()), "XER summary cells")
