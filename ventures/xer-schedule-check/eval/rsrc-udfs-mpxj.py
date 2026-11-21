"""Read, with MPXJ (github.com/joniles/mpxj, an independent reader), the
Microsoft Project XML msproject.mjs writes and the XER p6xer.mjs makes from it
again, and dump every resource custom field MPXJ finds:

- xml: each resource Text, Number, Cost and Date field with an alias
  (aliases: {Text1: title}) and its value per resource name
  (cells: {name: {Text1: value}});
- xer: each resource field MPXJ maps a resource UDF to, keyed by the UDF's
  title, per resource ID (cells: {RES01: {title: value}}).

eval/rsrc-udfs.mjs --mpxj then checks both against what was meant.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/rsrc-udfs-mpxj.py <file.xml> <file.back.xer> <out.json>"""
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
    if isinstance(v, JNumber):  # numbers and costs; text stays text ("40")
        return float(str(v))
    return str(v)


def dump(path, key, by_alias):
    proj = UniversalProjectReader().read(path)
    fields = []
    for cf in proj.getCustomFields():
        f = cf.getFieldType()
        if f is None or f.getFieldTypeClass() != FieldTypeClass.RESOURCE or cf.getAlias() is None:
            continue
        fields.append((str(f.name()).title().replace("_", ""), str(cf.getAlias()), f))
    aliases = {n: a for n, a, _ in fields}
    cells = {}
    for r in proj.getResources():
        k = r.getName() if key == "name" else r.getResourceID()
        if k is None:
            continue
        row = {}
        for n, a, f in fields:
            v = fmt(r.getCachedValue(f))
            if v is not None and v != "":
                row[a if by_alias else n] = v
        if row:
            cells[str(k)] = row
    return {"aliases": aliases, "cells": cells}


out = {"xml": dump(sys.argv[1], "name", False), "xer": dump(sys.argv[2], "id", True)}
with open(sys.argv[3], "w") as fh:
    json.dump(out, fh, indent=1)
print(sys.argv[1], len(out["xml"]["aliases"]), "aliased XML fields;", sum(len(v) for v in out["xml"]["cells"].values()), "XML cells;", sum(len(v) for v in out["xer"]["cells"].values()), "XER cells")
