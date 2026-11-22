"""Work contours written by p6xer.mjs, read back by MPXJ
(github.com/joniles/mpxj, an independent XER reader).

For each <stem>.xer in <out-dir> (p6xer.mjs's XER of a Microsoft Project
XML file with contoured assignments): every assignment MPXJ reads with a
work contour, its curve's name and its 21 values, against contours.mjs's
table (the 20 values after the first, scaled to sum to 1).

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/work-contours-mpxj.py <out-dir> [--json out.json]
"""
import json, os, sys
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.primavera import PrimaveraXERFileReader  # noqa: E402

PCT = {  # contours.mjs PROJECT_CONTOURS
    "Back Loaded": [10, 15, 25, 50, 50, 75, 75, 100, 100, 100],
    "Front Loaded": [100, 100, 100, 75, 75, 50, 50, 25, 15, 10],
    "Double Peak": [25, 50, 100, 50, 25, 25, 50, 100, 50, 25],
    "Early Peak": [25, 50, 100, 100, 75, 50, 50, 25, 15, 10],
    "Late Peak": [10, 15, 25, 50, 50, 75, 100, 100, 50, 25],
    "Bell": [10, 20, 40, 80, 100, 100, 80, 40, 20, 10],
    "Turtle": [25, 50, 75, 100, 100, 100, 100, 75, 50, 25],
}

args = sys.argv[1:]
out_json = None
if "--json" in args:
    k = args.index("--json")
    out_json = args[k + 1]
    del args[k:k + 2]
d = args[0]
rows = []
for f in sorted(os.listdir(d)):
    if not f.endswith(".xer"):
        continue
    p = PrimaveraXERFileReader().read(os.path.join(d, f))
    for a in p.getResourceAssignments():
        wc = a.getWorkContour()
        if wc is None or wc.getCurveValues() is None:
            continue
        name = str(wc.getName() or "")
        v = [float(x) for x in wc.getCurveValues()]
        key = name.replace("MS Project ", "")
        gap = None
        if key in PCT:
            s = sum(PCT[key])
            want = [x / s / 2 for x in PCT[key] for _ in (0, 1)]
            tot = sum(v[1:])
            gap = max(abs(v[1 + k] / tot - want[k]) for k in range(20))
        rows.append({"file": f, "task": str(a.getTask().getName()), "curve": name, "first": v[0], "sum": round(sum(v[1:]), 6), "gap": gap})
for r in rows:
    print(f"{r['file']}\t{r['task']}\t{r['curve']}\tsum {r['sum']}\tlargest gap {r['gap']:.2e}" if r["gap"] is not None else r)
ok = sum(1 for r in rows if r["gap"] is not None and r["gap"] < 1e-5)
print(f"\n{len(rows)} assignments with a curve; {ok} match contours.mjs to 1e-5")
if out_json:
    with open(out_json, "w") as fh:
        json.dump({"assignments": rows, "match": ok}, fh, indent=2)
        fh.write("\n")
