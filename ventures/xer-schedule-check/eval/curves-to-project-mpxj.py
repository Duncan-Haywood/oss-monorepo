"""Curved assignments in msproject.mjs's Project XML, read back by MPXJ
(github.com/joniles/mpxj, an independent MSPDI reader).

For each Project XML file in <out-dir> (written by
eval/curves-to-project.mjs --out): every assignment with a WorkContour, the
contour MPXJ reads, and its raw timephased remaining work (start, finish,
hours per row) against the TimephasedData rows in the file.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/curves-to-project-mpxj.py <out-dir> [--json out.json]
"""
import json, os, sys
import xml.etree.ElementTree as ET
import jpype, mpxj  # noqa: F401
jpype.startJVM()
from org.mpxj.mspdi import MSPDIReader  # noqa: E402

args = sys.argv[1:]
out_json = None
if "--json" in args:
    k = args.index("--json")
    out_json = args[k + 1]
    del args[k:k + 2]
out_dir = args[0]

NS = "{http://schemas.microsoft.com/project}"
CONTOUR = {"1": "BACK_LOADED", "2": "FRONT_LOADED", "3": "DOUBLE_PEAK", "4": "EARLY_PEAK", "5": "LATE_PEAK", "6": "BELL", "7": "TURTLE", "8": "CONTOURED"}


def hours(pt):
    # PT8H30M15S
    h = m = s = 0
    body = pt[2:]
    if "H" in body:
        h, body = body.split("H", 1)
    if "M" in body:
        m, body = body.split("M", 1)
    if "S" in body:
        s = body.split("S", 1)[0]
    return float(h) + float(m) / 60 + float(s) / 3600


results = []
for name in sorted(os.listdir(out_dir)):
    if not name.endswith(".xml"):
        continue
    path = os.path.join(out_dir, name)
    root = ET.parse(path).getroot()
    mine = {}
    for a in root.iter(NS + "Assignment"):
        wc = a.findtext(NS + "WorkContour")
        if not wc:
            continue
        rows = [hours(r.findtext(NS + "Value")) for r in a.findall(NS + "TimephasedData") if r.findtext(NS + "Type") == "1" and r.findtext(NS + "Value")]
        mine[a.findtext(NS + "UID")] = (wc, rows)
    if not mine:
        continue
    proj = MSPDIReader().read(path)
    for ra in proj.getResourceAssignments():
        uid = str(ra.getUniqueID())
        if uid not in mine:
            continue
        wc, rows = mine[uid]
        raw = ra.getRawTimephasedRemainingRegularWork() or []
        got = [float(t.getTotalAmount().getDuration()) * (1 if str(t.getTotalAmount().getUnits()) == "HOURS" else 1 / 60) for t in raw if t.getTotalAmount().getDuration() > 0]
        contour = str(ra.getWorkContour()) if ra.getWorkContour() is not None else None
        gap = max((abs(x - y) for x, y in zip(got, rows)), default=0)
        results.append({
            "file": name, "uid": uid, "contourWritten": wc, "contourMpxj": contour,
            "contourAgrees": contour is not None and contour.upper().replace(" ", "_") == CONTOUR[wc],
            "rows": len(rows), "rowsMpxj": len(got), "sumHours": round(sum(rows), 4), "sumMpxj": round(sum(got), 4),
            "largestRowGapHours": round(gap, 5),
        })

ok = [r for r in results if r["rows"] == r["rowsMpxj"] and r["largestRowGapHours"] < 1e-3]
summary = {"assignments": len(results), "rowsAgree": len(ok), "contourAgrees": sum(r["contourAgrees"] for r in results), "largestRowGapHours": max((r["largestRowGapHours"] for r in results), default=0)}
for r in results:
    print(f"{r['file']}\t{r['uid']}\t{r['contourWritten']} -> {r['contourMpxj']}\trows {r['rows']}/{r['rowsMpxj']}\tsum {r['sumHours']}/{r['sumMpxj']}\tgap {r['largestRowGapHours']}")
print("summary:", json.dumps(summary))
if out_json:
    with open(out_json, "w") as f:
        json.dump({"summary": summary, "assignments": results}, f, indent=2)
        f.write("\n")
