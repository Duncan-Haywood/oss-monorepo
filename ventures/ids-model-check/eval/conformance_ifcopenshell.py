"""ifcopenshell.validate on every .ifc under the folders given, one JSON line per file:
{"file", "opened", "issues": [{"id", "attribute", "message"}]}.
Set beside eval/conformance-sweep.mjs in eval/conformance-2026-11-24.md.
    python eval/conformance_ifcopenshell.py DIR... > OUT.jsonl   (pip install ifcopenshell)
"""
import json, logging, os, sys
import ifcopenshell, ifcopenshell.validate

def files(dirs):
    for d in dirs:
        for root, ds, fs in os.walk(d):
            ds[:] = [x for x in ds if x != ".git"]
            for f in fs:
                if f.lower().endswith(".ifc"):
                    yield os.path.join(root, f)

for path in sorted(files(sys.argv[1:])):
    logger = ifcopenshell.validate.json_logger()
    row = {"file": path, "opened": True, "issues": []}
    try:
        ifcopenshell.validate.validate(path, logger, express_rules=False)
    except Exception as e:  # a file IfcOpenShell cannot open at all
        row["opened"] = False
        row["issues"].append({"id": None, "attribute": None, "message": f"{type(e).__name__}: {e}"[:300]})
    for s in logger.statements:
        inst = s.get("instance")
        iid = None
        try:
            iid = inst.id() if inst is not None and hasattr(inst, "id") else None
        except Exception:
            pass
        row["issues"].append({"id": iid, "attribute": str(s.get("attribute"))[:120] if s.get("attribute") is not None else None, "message": str(s.get("message"))[:300]})
    print(json.dumps(row), flush=True)
