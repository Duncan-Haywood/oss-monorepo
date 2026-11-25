"""Sets eval/where-rules-sweep.mjs --json beside ifcopenshell.validate's WHERE
rule lines (eval/conformance_ifcopenshell.py --rules), rule by rule and record
by record. A rule line is one IfcOpenShell logs as an entity, type or file
rule (older runs without the type: one whose message carries "Violated by").
    python3 eval/where_rules_compare.py OURS.json IOS.jsonl [--show N] [--rule NAME]
Rule names are compared case-blind (IfcOpenShell writes type rules as
IfcPositiveLengthMeasure.WR1, this sweep as IFCPOSITIVELENGTHMEASURE.WR1).
"""
import collections, json, re, sys

ours = {r["file"]: r for r in json.load(open(sys.argv[1]))}
ios = {}
for l in open(sys.argv[2]):
    r = json.loads(l)
    # A schema IfcOpenShell will not read (IFC4X2: web-ifc's ifcbridge-model01)
    # is opened but never checked.
    if any((x["message"] or "").startswith("Unsupported schema") for x in r["issues"]):
        r["opened"] = False
    ios[r["file"]] = r
show = int(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else 10
only_rule = sys.argv[sys.argv.index("--rule") + 1].lower() if "--rule" in sys.argv else None


def ios_rules(row):
    out = set()
    for x in row["issues"]:
        m = x["message"] or ""
        # A rule line: its logged type when the run recorded it, else one whose
        # message carries "Violated by" or was cut at 300 characters before it
        # (a long rule's text) and is no attribute or header line.
        kind = x.get("type")
        if kind is not None:
            if not kind.endswith("rule"):
                continue
        elif "Violated by" not in m and not (len(m) >= 300 and not m.startswith(("Attribute", "For instance", "On instance", "With inverse"))):
            continue
        name = x.get("attribute")
        if not name:
            mm = re.search(r"Rule (\w+\.\w+)", m)
            name = mm.group(1) if mm else None
        # IfcApplication's and IfcRoot's UNIQUE rules are conformance.mjs's
        # and ids.mjs's (eval/conformance-2026-11-24.md), not WHERE rules.
        if not name or re.search(r"\.UR\d+$", name) or not ("." in name or name.startswith("Ifc")):
            continue
        iid = x["id"]
        out.add((iid, name.lower()))
    return out


per_rule = collections.defaultdict(lambda: [0, 0, 0])  # both, only ours, only ios
files = sorted(set(ours) & set(ios))
skipped = [f for f in files if not ios[f]["opened"]]
examples = collections.defaultdict(list)
for f in files:
    if not ios[f]["opened"]:
        continue
    o = {(x["id"], x["rule"].lower()) for x in ours[f]["findings"]}
    i = ios_rules(ios[f])
    for k in o | i:
        if only_rule and k[1] != only_rule:
            continue
        slot = 0 if (k in o and k in i) else 1 if k in o else 2
        per_rule[k[1]][slot] += 1
        if slot and len(examples[k[1]]) < 3:
            examples[k[1]].append((f.split("/")[-1], k[0], "only here" if slot == 1 else "only IfcOpenShell"))
tot = [sum(v[i] for v in per_rule.values()) for i in range(3)]
print(f"{len(files)} files ({len(skipped)} IfcOpenShell could not open, left out); "
      f"rule failures: {tot[0]} found by both, {tot[1]} only here, {tot[2]} only by IfcOpenShell; {len(per_rule)} rules fired")
print(f"{'rule':52} {'both':>6} {'here':>6} {'IOS':>6}")
for k, v in sorted(per_rule.items(), key=lambda kv: -sum(kv[1])):
    print(f"{k:52} {v[0]:6} {v[1]:6} {v[2]:6}")
diffs = [(k, e) for k, e in examples.items() if e]
if diffs:
    print("\nexamples of disagreement:")
    for k, e in diffs[:show]:
        print(" ", k, e)
