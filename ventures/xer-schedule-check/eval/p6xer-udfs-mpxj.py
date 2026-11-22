"""Custom fields through p6xer.mjs, read by MPXJ (github.com/joniles/mpxj, an
independent reader of both formats): for each pair of files, every task
custom field MPXJ finds under a title (Project's Alias, P6's UDF title) and
its value per task, compared between the two.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/p6xer-udfs-mpxj.py [--json out.json] [--text] <before> <after> [<before> <after> ...]

--text (XER pairs) also reads text UDFs, and counts the fields whose MPXJ
data type (INTEGER, NUMERIC, CURRENCY, DATE, STRING) is the same on both
sides and the values in them (eval/udf-type-hints-2026-11-22.md).

<before> is a Microsoft Project XML or an XER, <after> the XER p6xer.mjs
wrote from it (directly, or through msproject.mjs: an XER sent through
Project XML and back). Tasks are matched by activity ID: an XER's own, or for
a Project XML the "Activity ID" text field, else A + the task's ID x 10 (as
p6xer.mjs numbers them). Values compare as numbers to 0.005 (P6 shows two
decimals) or as dates to the minute; MPXJ's field type for each title is
reported beside (Project's Number/Cost/Date; for an XER the UDF's own type)."""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402

args = sys.argv[1:]
out_json = None
if "--json" in args:
    k = args.index("--json")
    out_json = args[k + 1]
    del args[k:k + 2]
with_text = "--text" in args
if with_text:
    args.remove("--text")


def value(v):
    if v is None:
        return None
    if hasattr(v, "getYear") and hasattr(v, "getHour"):
        return "%04d-%02d-%02d %02d:%02d" % (v.getYear(), v.getMonthValue(), v.getDayOfMonth(), v.getHour(), v.getMinute())
    s = str(v)
    try:
        return round(float(s), 4)
    except ValueError:
        return s


def read(path):
    p = UniversalProjectReader().read(path)
    xer = path.lower().endswith(".xer")
    fields = []
    if not xer:
        # every Number, Cost and Date field, titled by its Alias or, with none, its own name (Number3)
        from org.mpxj import TaskField
        cfs = p.getCustomFields()
        for label, attr, n, dt in (("Number", "NUMBER", 20, "NUMERIC"), ("Cost", "COST", 10, "CURRENCY"), ("Date", "DATE", 10, "DATE")):
            for i in range(1, n + 1):
                ft = getattr(TaskField, "%s%d" % (attr, i))
                cf = cfs.get(ft)
                a = cf.getAlias() if cf is not None else None
                fields.append((str(a) if a is not None and str(a) else "%s%d" % (label, i), ft, dt))
    for cf in (p.getCustomFields() if xer else []):
        ft = cf.getFieldType()
        a = cf.getAlias()
        if ft is None or a is None or str(ft.getFieldTypeClass()) != "TASK":
            continue
        dt = str(ft.getDataType())
        if dt not in ("NUMERIC", "CURRENCY", "DATE", "INTEGER", "SHORT") + (("STRING",) if with_text else ()):
            continue  # text fields are activity codes on the way through
        fields.append((str(a), ft, dt))
    id_field = None
    if not xer:
        for cf in p.getCustomFields():
            if cf.getAlias() is not None and str(cf.getAlias()).lower() == "activity id":
                id_field = cf.getFieldType()
    tasks = {}
    for t in p.getTasks():
        if t.getSummary() or t.getUniqueID() is None or (not xer and t.getUniqueID() == 0):
            continue
        if xer:
            aid = t.getActivityID()
        else:
            aid = t.getCachedValue(id_field) if id_field is not None else None
            if aid is None or str(aid) == "":
                aid = "A%d" % (int(t.getID()) * 10) if t.getID() is not None else None
        if aid is None:
            continue
        row = {}
        for a, ft, dt in fields:
            v = value(t.getCachedValue(ft))
            if v is None or v == "":
                continue
            row[a] = v
        tasks[str(aid)] = row
    return {"types": {a: dt for a, ft, dt in fields}, "tasks": tasks}


def same(x, y):
    if isinstance(x, float) and isinstance(y, float):
        return abs(x - y) < 0.005
    return x == y


results = []
for before, after in zip(args[0::2], args[1::2]):
    A, B = read(before), read(after)
    n = kept = extra = 0
    miss = []
    for aid, row in A["tasks"].items():
        brow = B["tasks"].get(aid, {})
        for a, v in row.items():
            n += 1
            if a in brow and same(v, brow[a]):
                kept += 1
            elif len(miss) < 3:
                miss.append([aid, a, v, brow.get(a)])
        for a, v in brow.items():
            if a not in row:
                extra += 1
    r = {"before": before.split("/")[-1], "after": after.split("/")[-1], "values": n, "kept": kept, "extra": extra, "miss": miss,
         "types": {a: [A["types"].get(a), B["types"].get(a)] for a in B["types"]}}
    same_type = {a for a, (x, y) in r["types"].items() if x == y}
    r["fieldsSameType"] = len(same_type)
    r["valuesSameType"] = sum(1 for aid, row in A["tasks"].items() for a, v in row.items() if a in same_type and a in B["tasks"].get(aid, {}) and same(v, B["tasks"][aid][a]))
    results.append(r)
    print("%s -> %s: %d/%d custom field values read back by MPXJ, %d extra; %d/%d fields (%d values) with the same data type %s" % (r["before"], r["after"], kept, n, extra, r["fieldsSameType"], len(r["types"]), r["valuesSameType"], json.dumps(miss) if miss else ""))
tot = sum(r["values"] for r in results)
print("all: %d/%d values, %d extra, in %d pairs" % (sum(r["kept"] for r in results), tot, sum(r["extra"] for r in results), len(results)))
if out_json:
    json.dump(results, open(out_json, "w"), indent=1)
