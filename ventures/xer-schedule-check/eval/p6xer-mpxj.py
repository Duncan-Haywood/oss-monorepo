"""Read a Microsoft Project XML file and the XER p6xer.mjs wrote from it with
MPXJ (github.com/joniles/mpxj, an independent open-source reader of both
formats, used by most schedule converters and by P6-to-Project tools) and
compare them task by task.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/p6xer-mpxj.py <xml-dir> <xer-dir> [--json out.json]

For every <name>.xml under xml-dir with a <name>.xer in xer-dir (as
`node eval/p6xer-check.mjs --mspdi <xml-dir> --write <xer-dir>` writes them).
Tasks are matched by activity ID: the XER's is A + the XML task's ID x 10.
A manually scheduled task not yet started is expected back as start on or
after its start (p6xer.mjs's mapping); MPXJ names "no constraint" None for an
XER and as soon as possible for an XML, which count as the same. Compared: name; start and
finish; actual start and finish; remaining duration (hours); constraint type
and date; predecessors (activity, type, lag in hours); resource assignments
(resource name, work, actual work, cost)."""
import json, os, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import TimeUnit  # noqa: E402


def dt(d):
    return None if d is None else str(d)[:16].replace("T", " ")


def hours(dur, props):
    if dur is None:
        return None
    return round(float(dur.convertUnits(TimeUnit.HOURS, props).getDuration()), 2)


def read(path, xer):
    p = UniversalProjectReader().read(path)
    if p is None:
        return None
    props = p.getProjectProperties()
    out = {}
    key = {}
    for t in p.getTasks():
        if t.getSummary() or t.getNull() or (t.getUniqueID() is not None and int(str(t.getUniqueID())) == 0 and not xer):
            continue
        if not xer and t.getActive() is not None and not t.getActive():
            continue
        if xer:
            k = str(t.getActivityID())
        else:
            k = "A%d" % (int(str(t.getID())) * 10) if t.getID() is not None else None
        if k is None:
            continue
        key[str(t.getUniqueID())] = k
        out[k] = t
    rows = {}
    for k, t in out.items():
        preds = sorted(
            "%s|%s|%s" % (key.get(str(r.getPredecessorTask().getUniqueID()), "?"), str(r.getType()), round(float(r.getLag().convertUnits(TimeUnit.HOURS, props).getDuration()), 2))
            for r in t.getPredecessors() if r.getPredecessorTask() is not None and str(r.getPredecessorTask().getUniqueID()) in key
        )
        asg = sorted(
            "%s|%s|%s|%s" % (str(a.getResource().getName()), hours(a.getWork(), props), hours(a.getActualWork(), props) or 0.0, round(float(a.getCost() or 0), 2))
            for a in t.getResourceAssignments() if a.getResource() is not None and a.getResource().getName() is not None and str(a.getResource().getType()) != "COST"
        )
        rows[k] = {
            "name": str(t.getName() or ""),
            "start": dt(t.getStart()), "finish": dt(t.getFinish()),
            "actualStart": dt(t.getActualStart()), "actualFinish": dt(t.getActualFinish()),
            "remaining": hours(t.getRemainingDuration(), props),
            "constraint": "%s|%s" % (str(t.getConstraintType()), dt(t.getConstraintDate()) if str(t.getConstraintType()) not in ("AS_SOON_AS_POSSIBLE", "AS_LATE_AS_POSSIBLE", "None") else ""),
            "preds": preds, "assignments": asg,
            "manual": (not xer) and str(t.getTaskMode()) == "MANUALLY_SCHEDULED" and t.getActualStart() is None,
        }
    return rows


CSTR = {  # MPXJ's names for the same constraint read from MSPDI and from XER
    "MUST_START_ON": "START_ON", "MUST_FINISH_ON": "FINISH_ON", "None": "AS_SOON_AS_POSSIBLE",
}

xml_dir, xer_dir = sys.argv[1], sys.argv[2]
json_out = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
fields = ["name", "start", "finish", "actualStart", "actualFinish", "remaining", "constraint", "preds", "assignments"]
tot = {f: 0 for f in fields}
n_all = n_tasks = n_files = 0
files = []
for root, _, names in os.walk(xml_dir):
    for nm in sorted(names):
        if not nm.lower().endswith(".xml"):
            continue
        xer = os.path.join(xer_dir, nm[:-4] + ".xer")
        if not os.path.exists(xer):
            continue
        try:
            a, b = read(os.path.join(root, nm), False), read(xer, True)
        except Exception as e:  # noqa: BLE001
            files.append({"file": nm, "error": str(e)[:200]})
            continue
        if a is None or b is None:
            continue
        n_files += 1
        ok = {f: 0 for f in fields}
        good = 0
        bad = []
        for k, ra in a.items():
            rb = b.get(k)
            if rb is None:
                bad.append({"id": k, "missing": True})
                continue
            this = True
            for f in fields:
                va, vb = ra[f], rb[f]
                if f == "constraint":
                    va = CSTR.get(va.split("|")[0], va.split("|")[0]) + "|" + va.split("|")[1]
                    vb = CSTR.get(vb.split("|")[0], vb.split("|")[0]) + "|" + vb.split("|")[1]
                    # a manual task not started is written as start on or after its start (p6xer.mjs, by design)
                    if ra["manual"]:
                        va = "START_NO_EARLIER_THAN|" + (ra["start"] or "")
                if va == vb:
                    ok[f] += 1
                else:
                    this = False
                    if len(bad) < 3:
                        bad.append({"id": k, "field": f, "xml": va, "xer": vb})
            good += this
        n_tasks += len(a)
        n_all += good
        for f in fields:
            tot[f] += ok[f]
        files.append({"file": nm, "tasks": len(a), "allSame": good, "fields": ok, "bad": bad})
        if good < len(a):
            print("%s: %d/%d same %s %s" % (nm, good, len(a), ok, bad[:2]))
print("MPXJ: %d files, %d of %d tasks read the same on every field; by field: %s" % (n_files, n_all, n_tasks, ", ".join("%s %d" % (f, tot[f]) for f in fields)))
if json_out:
    with open(json_out, "w") as fh:
        json.dump({"files": files, "tasks": n_tasks, "allSame": n_all, "fields": tot}, fh, indent=1)
