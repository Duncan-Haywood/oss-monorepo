"""Sets eval/conformance-sweep.mjs --json beside eval/conformance_ifcopenshell.py's
JSON lines, file by file and record by record (header findings as record None).
    python3 eval/conformance_compare.py OURS.json IOS.jsonl [--show N] [--no-inverse]
Classes outside the schema and duplicate GlobalIds are ids.mjs's own notes,
so IfcOpenShell's "not found in schema" and GlobalId lines are counted apart.
"""
import json, re, sys
ours = {r["file"]: r for r in json.load(open(sys.argv[1]))}
ios = {}
for l in open(sys.argv[2]):
    r = json.loads(l); ios[r["file"]] = r
show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 10
both = agree_clean = only_ours = only_ios = 0
rec_both = rec_ours = rec_ios = 0
apart = inverse = 0
diffs = []
for f in sorted(set(ours) & set(ios)):
    o = {x["id"] for x in ours[f]["findings"] if x["code"] != "unreadable-record" and not ("--no-inverse" in sys.argv and x["code"] == "inverse-count")}
    unread = {x["id"] for x in ours[f]["findings"] if x["code"] == "unreadable-record"}
    i = set()
    for x in ios[f]["issues"]:
        m = x["message"]
        # Classes outside the schema and duplicate GlobalIds (IfcRoot's UNIQUE
        # rule, "On instance:" lines not on an IfcApplication) are ids.mjs notes.
        if ("not found in schema" in m and "IFCNONEXISTANT" not in m and "nan." not in m) or (m.startswith("On instance:") and "IfcApplication" not in m):
            apart += 1; continue
        # Inverse cardinalities are compared record by record (conformance.mjs
        # inverse-count, 2026-11-24); --no-inverse sets them apart as before.
        if m.startswith("With inverse:") and "IsGroupedBy" not in m:
            inverse += 1
            if "--no-inverse" in sys.argv: continue
        iid = x["id"]
        if iid is None:
            mm = re.search(r"#(\d+)\s*=", m)
            iid = int(mm.group(1)) if mm and "FILE_" not in m and "header" not in m else None
        i.add(iid)
    if unread and None in i and len(i) == 1:
        i = set(); o |= set()
    if not o and not i: agree_clean += 1
    elif o and i: both += 1
    elif o: only_ours += 1
    else: only_ios += 1
    rec_both += len(o & i); rec_ours += len(o - i); rec_ios += len(i - o)
    if o != i: diffs.append((f, sorted(o - i, key=str)[:5], sorted(i - o, key=str)[:5], [x["message"][:160].replace("\n", " ") for x in ios[f]["issues"] if x["id"] in (i - o) or (x["id"] is None and None in (i - o))][:2]))
print(f"{len(set(ours) & set(ios))} files: {agree_clean} clean in both, {both} flagged by both, {only_ours} only here, {only_ios} only by IfcOpenShell")
print(f"records: {rec_both} flagged by both, {rec_ours} only here, {rec_ios} only by IfcOpenShell; {apart} IfcOpenShell lines on outside-schema classes or GlobalIds (ids.mjs notes, set apart); {inverse} on inverse cardinalities ({'set apart' if '--no-inverse' in sys.argv else 'compared'})")
for d in diffs[:show]:
    print(" ", d[0].split("/")[-1], "only here:", d[1], "only IfcOpenShell:", d[2], d[3])
