#!/usr/bin/env python3
"""IfcTester's verdict on eval/member-lengths-fill.mjs --out DIR: each model
with its stored Lengths hidden, and the same model after the fill wrote
Lengths from geometry, against eval/member-lengths/member-lengths.ids.xml.

    pip install ifcopenshell==0.9.0.post1 ifctester==0.9.0
    python3 eval/member_lengths_ifctester.py DIR

Prints, per model and specification, the applicable elements and how many
pass before and after. Every element the fill wrote should go from fail to pass.
"""
import sys
from pathlib import Path

import ifcopenshell
from ifctester import ids as idsmod

# IfcTester 0.9.0's property facet reads `quantity.declaration` on a quantity
# with its own unit, an accessor IfcOpenShell 0.9.0.post1's entity_instance
# lacks (AttributeError on HHS and Tekla files); give it the schema
# declaration it means.
if not hasattr(ifcopenshell.entity_instance, "declaration"):
    ifcopenshell.entity_instance.declaration = property(lambda self: self.wrapped_data.declaration().as_entity())

IDS = Path(__file__).with_name("member-lengths") / "member-lengths.ids.xml"


def verdicts(path):
    spec = idsmod.open(str(IDS))
    spec.validate(ifcopenshell.open(str(path)))
    out = {}
    for s in spec.specifications:
        app = len(s.applicable_entities)
        failed = len(s.failed_entities)
        out[s.name] = (app, app - failed)
    return out


for hidden in sorted(Path(sys.argv[1]).glob("*.hidden.ifc")):
    filled = hidden.with_name(hidden.name.replace(".hidden.", ".filled."))
    before, after = verdicts(hidden), verdicts(filled)
    for name, (app, ok) in before.items():
        if not app:
            continue
        print(f"{hidden.name.replace('.hidden.ifc', '')} | {name} | {app} applicable | {ok} pass before | {after[name][1]} pass after")
