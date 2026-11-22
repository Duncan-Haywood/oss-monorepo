"""Opens each STEP file step-writer.mjs wrote (paths from eval/to-step-twins.mjs
--list) with IfcOpenShell, a reader written independently of this checker, and
runs its schema validation (ifcopenshell.validate: attribute types, counts,
list bounds, enumerations, inverse cardinalities and WHERE rules where it
implements them). Prints one line per file and a total.

    python -m venv venv && venv/bin/pip install ifcopenshell
    node eval/to-step-twins.mjs --out OUT --list LIST eval/twins/...
    venv/bin/python eval/to-step-ifcopenshell.py LIST [--express-rules]

Where the model has a STEP twin from the same exporter (X.ifc next to
X.ifcxml / X.json, or X_IFC4X3.ifc next to X_IFC5.ifcx), the twin is
validated too, so an issue the exporter's own .ifc already has is told apart
from one the writer added ("same as twin" / "not in twin", compared as the
counts of each issue kind per file).
"""
import sys
import collections
import os
import re
import ifcopenshell
import ifcopenshell.validate

paths = [p for p in open(sys.argv[1]).read().split("\n") if p]
rules = "--express-rules" in sys.argv
def twin_of(written):
    # eval/to-step-twins.mjs --out names a file by its source path, "/" as "__".
    src = os.path.basename(written).replace("__", "/")
    stem = re.sub(r"\.ifc$", "", src)
    for cand in (stem + ".ifc", re.sub(r"_IFC5$", "_IFC4X3", stem) + ".ifc"):
        for root in ("", os.path.dirname(os.path.abspath(__file__)) + "/../"):
            if os.path.exists(root + cand) and root + cand != written:
                return root + cand
    return None


def issues(f):
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log, express_rules=rules)
    return log.statements


def kind(s):
    msg = str(s.get("message", ""))
    attr = str(s.get("attribute", "") or "")
    ent = re.sub(r"#\d+=", "", str(s.get("instance", "") or ""))[:30].split("(")[0]
    return (msg.split(":")[0][:60] + " " + ent + " " + attr[:60]).strip()


twinned = 0
added = collections.Counter()
inherited = 0
opened = 0
clean = 0
kinds = collections.Counter()
sample = {}
for p in paths:
    try:
        f = ifcopenshell.open(p)
    except Exception as e:  # noqa: BLE001 - any failure to open is the finding
        print(f"NOT OPENED {p}: {e}")
        kinds["not opened"] += 1
        continue
    opened += 1
    stm = issues(f)
    tw = twin_of(p)
    note = ""
    if tw:
        try:
            ct = collections.Counter(kind(s) for s in issues(ifcopenshell.open(tw)))
            cw = collections.Counter(kind(s) for s in stm)
            extra = cw - ct
            twinned += 1
            inherited += sum((cw & ct).values())
            added.update(extra)
            note = f"  twin {sum(ct.values())} issues, not in twin {sum(extra.values())}"
        except Exception as e:  # noqa: BLE001
            note = f"  twin not validated: {e}"

    class L:
        statements = stm
    log = L
    if not log.statements:
        clean += 1
    for s in log.statements:
        msg = str(s.get("message", ""))
        k = msg.split(":")[0][:80]
        kinds[k] += 1
        sample.setdefault(k, f"{p.split('/')[-1]}: {msg[:200]}")
    print(f"{len(log.statements):5d} issues  {len(list(f)):6d} entities  {p.split('/')[-1]}{note}")
print(f"\n{opened} of {len(paths)} written files opened by IfcOpenShell {ifcopenshell.version}; {clean} with no validation issue")
for k, n in kinds.most_common():
    print(f"- {n} x {k}\n    e.g. {sample.get(k, '')}")
print(f"\nwith a STEP twin: {twinned} files; {inherited} issues the twin has too, {sum(added.values())} not in the twin")
for k, n in added.most_common(30):
    print(f"- not in twin: {n} x {k}")
