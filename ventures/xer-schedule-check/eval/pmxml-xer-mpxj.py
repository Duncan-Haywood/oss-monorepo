"""Read each original XER and the XER pmxmlToXer wrote from its P6 XML with
MPXJ (github.com/joniles/mpxj, an independent reader) and compare them
activity by activity: name, type (milestone or not), start, finish, remaining
duration, actual start and finish, constraint type and date, calendar, and
each predecessor (activity, type, lag).

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/pmxml-xer-mpxj.py ORIGDIR BACKDIR     (BACKDIR from pmxml-check.mjs --write)
"""
import os, sys, jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.primavera import PrimaveraXERFileReader  # noqa: E402
from org.mpxj import TimeUnit  # noqa: E402


def dt(d):
    return None if d is None else str(d)[:16]


def hours(d, props):
    return None if d is None else round(float(d.convertUnits(TimeUnit.HOURS, props).getDuration()), 2)


def read(path):
    out = {}
    for p in PrimaveraXERFileReader().readAll(path):
        props = p.getProjectProperties()
        for t in p.getTasks():
            code = t.getActivityID()
            if code is None or t.getSummary():
                continue
            preds = sorted((str(r.getPredecessorTask().getActivityID()), str(r.getType()), hours(r.getLag(), props)) for r in t.getPredecessors())
            cal = t.getCalendar()
            out[(str(p.getProjectProperties().getProjectID()), str(code))] = {
                "name": str(t.getName()), "milestone": bool(t.getMilestone()), "start": dt(t.getStart()), "finish": dt(t.getFinish()),
                "remaining": hours(t.getRemainingDuration(), props), "actualStart": dt(t.getActualStart()), "actualFinish": dt(t.getActualFinish()),
                "constraint": str(t.getConstraintType()), "constraintDate": dt(t.getConstraintDate()),
                "calendar": None if cal is None else str(cal.getName()), "preds": preds,
            }
    return out


orig_dir, back_dir = sys.argv[1], sys.argv[2]
tot = {"acts": 0, "missing": 0, "fields": 0, "same": 0}
for f in sorted(os.listdir(back_dir)):
    if not f.endswith(".xer"):
        continue
    a, b = read(os.path.join(orig_dir, f)), read(os.path.join(back_dir, f))
    diff = {}
    same = fields = missing = 0
    for k, va in a.items():
        vb = b.get(k)
        if vb is None:
            missing += 1
            continue
        for fld, x in va.items():
            fields += 1
            y = vb[fld]
            if fld == "remaining" and x is not None and y is not None and abs(x - y) <= 0.01:
                y = x  # P6 XML written by MPXJ rounds durations to 2 decimals
            if fld == "preds":
                x = [(c, t, None if l is None else round(l, 1)) for c, t, l in x]
                y = [(c, t, None if l is None else round(l, 1)) for c, t, l in y]
            if x == y:
                same += 1
            else:
                diff.setdefault(fld, []).append((k[1], x, y))
    tot["acts"] += len(a); tot["missing"] += missing; tot["fields"] += fields; tot["same"] += same
    print(f"{f}: {len(a)} activities ({missing} missing); fields same {same}/{fields}" + "".join(f"\n    {fld}: {len(v)} differ, e.g. {v[:2]}" for fld, v in diff.items()))
print(f"TOTAL {tot['acts']} activities, {tot['missing']} missing, fields same {tot['same']}/{tot['fields']}")
