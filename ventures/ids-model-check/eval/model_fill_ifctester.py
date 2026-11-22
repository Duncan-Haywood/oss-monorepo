#!/usr/bin/env python3
"""Check filled models (eval/model-fill-sweep.mjs --write N) with IfcOpenShell.

    pip install ifcopenshell==0.9.0.post1 ifctester==0.9.0
    python3 eval/model_fill_ifctester.py OUT_DIR ORIGINAL.ifc [ORIGINAL.ifc ...]

For each filled file saved in OUT_DIR (and its .written.json list of the
(element, set, property) values the fill wrote):
  - ifcopenshell opens it (a STEP syntax error or a bad reference would stop it);
  - IfcTester runs the same IDS on the original and the filled model, and for
    every requirement that is a property facet naming one set and property
    (or an attribute facet naming one attribute), the
    written elements must fail it before (else the fill wrote what was not
    asked) and pass it after;
  - no element IfcTester passed before fails after (the fill took nothing away).
    Records the fill added (numbers above the original's highest) are counted
    apart: a specification that applies to every rooted entity ("everything is
    classified") applies to the new property sets and relationships too, and
    they fail it as the model's own sets do.
One JSON line per file on stdout; exit 1 if any check fails.
"""
import json
import sys
from pathlib import Path

import ifcopenshell
from ifctester import ids as idsmod
from ifctester.facet import Attribute, Property


def failing(spec_file, model):
    spec = idsmod.open(spec_file)
    spec.validate(model)
    out = []  # (spec index, requirement index, facet, failing ids, applicable ids)
    for si, s in enumerate(spec.specifications):
        app = {e.id() for e in s.applicable_entities}
        for ri, r in enumerate(s.requirements):
            ids = set()
            for f in getattr(r, "failures", []) or []:
                el = f.get("element") if isinstance(f, dict) else None
                if el is not None and hasattr(el, "id"):
                    ids.add(el.id())
            out.append((si, ri, r, ids, app))
    return out


def main():
    out_dir = Path(sys.argv[1])
    originals = {Path(p).stem: Path(p) for p in sys.argv[2:]}
    cache = {}
    bad = 0
    for filled in sorted(out_dir.glob("*.ifc")):
        meta = json.loads(Path(str(filled) + ".written.json").read_text())
        stem = filled.name.split("__")[1]
        orig = originals[stem]
        row = {"file": filled.name}
        try:
            idsmod.open(meta["ids"])
        except Exception as e:  # noqa: BLE001 - IfcTester refuses the IDS itself
            row["ids_refused"] = f"{type(e).__name__}"
            print(json.dumps(row), flush=True)
            continue
        try:
            if stem not in cache:
                cache.clear()
                cache[stem] = ifcopenshell.open(str(orig))
            before_model = cache[stem]
            top = max(e.id() for e in before_model)
            after_model = ifcopenshell.open(str(filled))
            row["opened"] = True
            before = failing(meta["ids"], before_model)
            after = failing(meta["ids"], after_model)
        except Exception as e:  # noqa: BLE001 - recorded, not hidden
            row["error"] = f"{type(e).__name__}: {e}"[:300]
            print(json.dumps(row), flush=True)
            bad += 1
            continue
        written = {}
        kind_of = {}
        for w in meta["written"]:
            written.setdefault((w["pset"], w["prop"]), set()).add(w["id"])
            kind_of[(w["pset"], w["prop"])] = w.get("kind", "property")
        checked = now_pass = was_failing = 0
        by_kind = {}
        regress = 0
        added_failing = 0
        stuck = []
        for (si, ri, r, fb, app), (_, _, _, fa, _) in zip(before, after):
            new = fa - fb
            added_failing += sum(1 for x in new if x > top)
            regress += sum(1 for x in new if x <= top)
            if isinstance(r, Property) and isinstance(r.propertySet, str) and isinstance(r.baseName, str):
                key = (r.propertySet, r.baseName)
            elif isinstance(r, Attribute) and isinstance(r.name, str):
                key = ("(attribute)", r.name)
            else:
                continue
            if getattr(r, "cardinality", "required") != "required":
                continue
            ids = written.get(key, set()) & app
            k = by_kind.setdefault(kind_of.get(key, "property"), [0, 0])
            k[0] += len(ids)
            k[1] += len(ids - fa)
            checked += len(ids)
            was_failing += len(ids & fb)
            now_pass += len(ids - fa)
            stuck += sorted(ids & fa)[:5]
        row.update({"values_checked": checked, "failed_before": was_failing, "pass_after": now_pass, "newly_failing": regress, "added_records_failing": added_failing, "still_failing_sample": stuck[:10], "by_kind": by_kind})
        ok = checked == now_pass and regress == 0
        row["ok"] = ok
        bad += 0 if ok else 1
        print(json.dumps(row), flush=True)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
