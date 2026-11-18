#!/usr/bin/env python3
"""Mutated copies of the valid IDS files, for eval/ids-structure.mjs.

    python3 eval/ids-structure-mutate.py OUT_DIR truth.jsonl [per_file]

Each copy gets one random change of the kind real files show: two sibling
elements swapped, an element dropped or duplicated, an attribute added (a
real one in the wrong place, or a misspelling), a fixed-list attribute given
a wrong value, text put where elements belong, an element renamed. Seeded,
so the set is the same on every run. Then validate the copies with
eval/ids-xsd-truth.py and compare with node eval/ids-structure.mjs.
"""
import json
import os
import random
import sys
import xml.etree.ElementTree as ET

out, truth = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 6
rng = random.Random(int(os.environ.get("SEED", "20261118")))
os.makedirs(out, exist_ok=True)
IDS = "{http://standards.buildingsmart.org/IDS}"
ATTRS = ["cardinality", "minOccurs", "maxOccurs", "instructions", "uri", "dataType", "datatype", "relation", "name", "ifcVersion", "description", "identifier"]
VALUES = ["required", "optional", "prohibited", "Optional", "0", "unbounded", "IFCLABEL", "IfcLabel", "IFC4", "IFC4X3", "IFCRELNESTS", "IFCRELFILLSELEMENT", "x"]
NAMES = ["entity", "name", "value", "system", "simpleValue", "partOf", "property", "baseName", "propertySet", "applicability", "requirements", "material", "classification", "attribute", "predefinedType"]
ET.register_namespace("", "http://standards.buildingsmart.org/IDS")
ET.register_namespace("xs", "http://www.w3.org/2001/XMLSchema")
ET.register_namespace("xsi", "http://www.w3.org/2001/XMLSchema-instance")


def mutate(root):
    els = [e for e in root.iter()]
    parents = {c: p for p in root.iter() for c in p}
    kind = rng.choice(["swap", "drop", "dup", "attr", "value", "text", "rename"])
    e = rng.choice(els[1:])
    p = parents[e]
    kids = list(p)
    i = kids.index(e)
    if kind == "swap" and len(kids) > 1:
        j = rng.choice([k for k in range(len(kids)) if k != i])
        kids[i], kids[j] = kids[j], kids[i]
        for c in list(p):
            p.remove(c)
        p.extend(kids)
    elif kind == "drop":
        p.remove(e)
    elif kind == "dup":
        p.insert(i, ET.fromstring(ET.tostring(e)))
    elif kind == "attr":
        e.set(rng.choice(ATTRS), rng.choice(VALUES))
    elif kind == "value" and e.attrib:
        e.set(rng.choice(list(e.attrib)), rng.choice(VALUES))
    elif kind == "text":
        e.text = (e.text or "") + "stray"
    else:
        e.tag = (IDS if e.tag.startswith(IDS) else e.tag[: e.tag.index("}") + 1] if e.tag.startswith("{") else "") + rng.choice(NAMES)
    return kind


for line in open(truth):
    r = json.loads(line)
    if not r["valid"]:
        continue
    base = os.path.basename(r["file"])[:80].replace(" ", "_")
    for k in range(per):
        tree = ET.parse(r["file"])
        kind = mutate(tree.getroot())
        tree.write(os.path.join(out, f"{base}.{k}.{kind}.ids"), encoding="utf-8", xml_declaration=True)
