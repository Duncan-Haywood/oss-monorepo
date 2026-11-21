"""Expenses through msproject.mjs and p6xer.mjs, read by MPXJ
(github.com/joniles/mpxj, an independent reader of both formats).

For each <stem> that eval/expenses-check.mjs --out wrote (<stem>.source.xer,
<stem>.xml, <stem>.back.xer):

  1. the source XER and the XER read back: every expense item MPXJ finds,
     matched by activity ID and name (two of one name on one activity
     summed): planned, actual and remaining cost to the cent, and, for single
     ones, category, accrual, vendor, document (PO) number, planned units,
     unit of measure and description;
  2. the Project XML: per activity (the "Activity ID" text field, Text1), the
     cost resource assignments' cost, actual cost, remaining cost and
     baseline cost against the source expenses' at-completion (actual +
     remaining), actual, remaining and planned cost.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/expenses-mpxj.py <out-dir> [--json out.json]
"""
import json, os, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj.primavera import PrimaveraXERFileReader  # noqa: E402

args = sys.argv[1:]
out_json = None
if "--json" in args:
    k = args.index("--json")
    out_json = args[k + 1]
    del args[k:k + 2]
d = args[0]


def c(x):
    return round(float(str(x)) * 100) if x is not None else 0


def s(x):
    return "" if x is None else " ".join(str(x).split())


def expenses(path):
    # every project in the file (a multi-project XER: UniversalProjectReader reads one)
    g = {}
    for p in PrimaveraXERFileReader().readAll(path):
        add_expenses(p, g)
    return g


def add_expenses(p, g):
    for t in p.getTasks():
        items = t.getExpenseItems()
        if items is None:
            continue
        for e in items:
            k = (str(t.getActivityID()), s(e.getName()) or "Expense")
            r = g.setdefault(k, {"n": 0, "planned": 0, "actual": 0, "remaining": 0})
            r["n"] += 1
            r["planned"] += c(e.getPlannedCost())
            r["actual"] += c(e.getActualCost())
            r["remaining"] += c(e.getRemainingCost())
            units = e.getPlannedUnits()
            units = float(str(units)) if units is not None else 0
            r["text"] = {
                "category": s(e.getCategory().getName()) if e.getCategory() is not None else "",
                "accrual": s(e.getAccrueType()),
                "vendor": s(e.getVendor()),
                "po": s(e.getDocumentNumber()),
                "quantity": "" if units in (0, 1) and not s(e.getUnitOfMeasure()) else "%g %s" % (units, s(e.getUnitOfMeasure())),
                "description": s(e.getDescription()),
            }


def project_costs(path):
    p = UniversalProjectReader().read(path)
    g = {}
    for a in p.getResourceAssignments():
        r = a.getResource()
        if r is None or str(r.getType()) != "COST":
            continue
        k = s(a.getTask().getText(1))
        x = g.setdefault(k, {"cost": 0, "actual": 0, "remaining": 0, "baseline": 0})
        x["cost"] += c(a.getCost())
        x["actual"] += c(a.getActualCost())
        x["remaining"] += c(a.getRemainingCost())
        x["baseline"] += c(a.getBaselineCost())
    return g


out = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".source.xer"):
        continue
    stem = f[: -len(".source.xer")]
    A = expenses(os.path.join(d, f))
    B = expenses(os.path.join(d, stem + ".back.xer"))
    P = project_costs(os.path.join(d, stem + ".xml"))
    row = {"file": stem, "groups": len(A), "back": len(B), "matched": 0, "planned": 0, "actual": 0, "remaining": 0, "single": 0,
           "category": 0, "accrual": 0, "vendor": 0, "po": 0, "quantity": 0, "description": 0, "misses": []}
    for k, a in A.items():
        b = B.get(k)
        if b is None:
            row["misses"].append("%s|%s missing" % k)
            continue
        row["matched"] += 1
        for f2 in ("planned", "actual", "remaining"):
            row[f2] += a[f2] == b[f2]
        if a["n"] == 1 and b["n"] == 1:
            row["single"] += 1
            for f2, v in a["text"].items():
                ok = v == b["text"][f2]
                row[f2] += ok
                if not ok and len(row["misses"]) < 10:
                    row["misses"].append("%s|%s %s: %r vs %r" % (k[0], k[1], f2, v, b["text"][f2]))
    # per activity, the Project XML's cost resource assignments
    by_act = {}
    for (act, _), a in A.items():
        x = by_act.setdefault(act, {"cost": 0, "actual": 0, "remaining": 0, "baseline": 0})
        x["cost"] += a["actual"] + a["remaining"]
        x["actual"] += a["actual"]
        x["remaining"] += a["remaining"]
        x["baseline"] += a["planned"]
    row["activities"] = len(by_act)
    row["project_xml_match"] = sum(1 for k, v in by_act.items() if P.get(k) == v)
    out.append(row)
    print("%s: MPXJ reads %d (activity, name) expense groups in the source, %d back; matched %d, planned %d, actual %d, remaining %d; "
          "single %d: category %d, accrual %d, vendor %d, PO %d, quantity %d, description %d; Project XML cost assignments = source on %d of %d activities"
          % (stem, row["groups"], row["back"], row["matched"], row["planned"], row["actual"], row["remaining"], row["single"], row["category"],
             row["accrual"], row["vendor"], row["po"], row["quantity"], row["description"], row["project_xml_match"], row["activities"]))
    for m in row["misses"][:5]:
        print("  " + m)
if out_json:
    with open(out_json, "w") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
