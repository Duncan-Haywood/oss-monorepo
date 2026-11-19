# The IDS files eval/bsdd-units-model.mjs writes, checked by IfcTester
# (IfcOpenShell; pip install ifctester), to compare with this checker:
#   node eval/bsdd-units-model.mjs --write DIR
#   python -I eval/bsdd-units-ifctester.py DIR/model.ifc DIR/before.ids DIR/type-only.ids DIR/after.ids
import sys
import ifcopenshell
import ifctester.ids as I
import ifctester.reporter as Rp

model = ifcopenshell.open(sys.argv[1])
for f in sys.argv[2:]:
    ids = I.open(f)
    ids.validate(model)
    rep = Rp.Json(ids)
    rep.report()
    for s in rep.results["specifications"]:
        ids_failed = set()
        for q in s["requirements"]:
            for e in q.get("failed_entities", []):
                ids_failed.add(str(e.get("element")))
        names = sorted(model.by_id(int(x.split("=")[0].lstrip("#"))).Name for x in ids_failed)
        print(f.split("/")[-1], "applicable", s["total_applicable"], "pass", s["total_applicable_pass"], "failed", names)
