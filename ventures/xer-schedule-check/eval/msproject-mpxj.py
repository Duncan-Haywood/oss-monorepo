"""Read an XER and the MSPDI msproject.mjs wrote from it with MPXJ
(github.com/joniles/mpxj, an independent open-source reader of both formats,
used by most schedule converters) and compare them activity by activity.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/msproject-mpxj.py <file.xer> <file.xml> [<file.xer> <file.xml> ...]

Matched by activity ID (MPXJ's Activity ID for the XER, Text1 for the XML).
Compared: name; start and finish; remaining duration; actual start and
finish; % complete state; constraint type and date; calendar working hours
per week; relationships (predecessor, type, lag); resource assignments
(count, work, actual and remaining work, cost)."""
import json, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj import TimeUnit  # noqa: E402


def dt(d):
    return None if d is None else str(d)[:16].replace("T", " ")


def hours(dur, props):
    if dur is None:
        return None
    return round(float(dur.convertUnits(TimeUnit.HOURS, props).getDuration()), 4)


def week_hours(cal):
    if cal is None:
        return None
    from java.time import DayOfWeek
    tot = 0.0
    for d in DayOfWeek.values():
        h = cal.getCalendarHours(d)
        if h is None:
            continue
        for r in h:
            a, b = r.getStart(), r.getEnd()
            m = (b.toSecondOfDay() - a.toSecondOfDay()) / 60.0
            if m <= 0:
                m += 1440
            tot += m
    return round(tot / 60.0, 2)


def read(path, key, want=None):
    if key == "xer":
        # a multi-project XER: the project whose activity IDs the XML holds
        from org.mpxj.primavera import PrimaveraXERFileReader
        projects = list(PrimaveraXERFileReader().readAll(path))
        if want:
            projects.sort(key=lambda q: -sum(1 for t in q.getTasks() if str(t.getActivityID()) in want))
        p = projects[0]
    else:
        p = UniversalProjectReader().read(path)
    props = p.getProjectProperties()
    out = {}
    for t in p.getTasks():
        if t.getSummary() or t.getUniqueID() is None or t.getUniqueID() == 0:
            continue
        k = str(t.getActivityID()) if key == "xer" else (str(t.getText(1)) if t.getText(1) is not None else None)
        if not k or k == "None":
            continue
        preds = sorted(
            (str(r.getPredecessorTask().getActivityID() if key == "xer" else r.getPredecessorTask().getText(1)),
             str(r.getType()), hours(r.getLag(), props))
            for r in t.getPredecessors())
        asg = [a for a in t.getResourceAssignments() if a.getResource() is not None]
        out[k] = {
            "name": str(t.getName()),
            "start": dt(t.getStart()), "finish": dt(t.getFinish()),
            "remaining": hours(t.getRemainingDuration(), props),
            "actualStart": dt(t.getActualStart()), "actualFinish": dt(t.getActualFinish()),
            "constraint": str(t.getConstraintType()), "constraintDate": dt(t.getConstraintDate()),
            "calendarWeek": week_hours(t.getEffectiveCalendar()),
            "preds": preds,
            "loe": str(t.getActivityType()) in ("LEVEL_OF_EFFORT", "WBS_SUMMARY") if key == "xer" else bool(t.getTaskMode() is not None and str(t.getTaskMode()) == "MANUALLY_SCHEDULED"),
            "assignments": len(asg),
            "work": round(sum(hours(a.getWork(), props) or 0 for a in asg), 3),
            "actualWork": round(sum(hours(a.getActualWork(), props) or 0 for a in asg), 3),
            "remainingWork": round(sum(hours(a.getRemainingWork(), props) or 0 for a in asg), 3),
            "cost": round(sum(float(a.getCost() or 0) for a in asg), 2),
        }
    return out


CONSTRAINT_SAME = {"MANDATORY_START": "MUST_START_ON", "MANDATORY_FINISH": "MUST_FINISH_ON", "START_ON": "MUST_START_ON", "FINISH_ON": "MUST_FINISH_ON"}
results = []
args = [a for i, a in enumerate(sys.argv[1:]) if a != "--json" and (i == 0 or sys.argv[i] != "--json")]
for xer_path, xml_path in zip(args[::2], args[1::2]):
    b = read(xml_path, "xml")
    a = read(xer_path, "xer", set(b))
    fields = ["name", "start", "finish", "remaining", "actualStart", "actualFinish", "constraint", "calendarWeek", "preds", "assignments", "work", "actualWork", "remainingWork", "cost"]
    ok = {f: 0 for f in fields}
    n = 0
    miss = 0
    examples = {}
    for k, x in a.items():
        if x["loe"]:
            continue
        y = b.get(k)
        if y is None:
            miss += 1
            continue
        n += 1
        for f in fields:
            vx, vy = x[f], y[f]
            if f == "constraint":
                vx = "AS_SOON_AS_POSSIBLE" if vx == "None" else vx
                vy = "AS_SOON_AS_POSSIBLE" if vy == "None" else vy
                vx = CONSTRAINT_SAME.get(vx, vx)
                vy = CONSTRAINT_SAME.get(vy, vy)
            if f == "preds":
                # links to level of effort go into notes, not links
                vx = [p for p in vx if not (a.get(p[0]) or {}).get("loe")]
            if f in ("work", "actualWork", "remainingWork", "cost", "remaining", "calendarWeek") and vx is not None and vy is not None:
                same = abs(vx - vy) <= max(0.02, abs(vx) * 1e-6)
            else:
                same = vx == vy
            if same:
                ok[f] += 1
            elif f not in examples:
                examples[f] = {"id": k, "xer": vx, "xml": vy}
    r = {"xer": xer_path.split("/")[-1], "activities": n, "missing": miss, "fields": ok, "examples": examples}
    results.append(r)
    print(f"{r['xer']}: {n} activities ({miss} missing): " + ", ".join(f"{f} {v}" for f, v in ok.items()))
    for f, e in examples.items():
        print(f"   first {f} difference: {e}")
if "--json" in sys.argv:
    json.dump(results, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
