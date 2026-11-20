#!/usr/bin/env python3
"""IfcTester's side of eval/spec-doc.mjs: does each sentence of the
requirements document say what IfcTester reads in the same facet?

    pip install ifctester==0.9.0
    python3 eval/spec_doc_ifctester.py DOC.jsonl

For every IDS file IfcTester opens, and every specification in it, checks:
  - the same number of applicability and requirement facets, of the same kinds,
    in the same order;
  - each requirement's cardinality (required / optional / prohibited);
  - the specification's optionality (minOccurs / maxOccurs);
  - every name and value IfcTester holds for the facet (simple values,
    enumeration members, patterns, bounds, lengths, dataType, relation)
    appears verbatim in that facet's sentence (class names compared without
    case, since the document writes IFCWALL as IfcWall).
Prints counts and every miss.
"""
import json
import sys

import ifctester
from ifctester import ids as idsmod
from ifctester import facet as fm

KINDS = {fm.Entity: "entity", fm.Attribute: "attribute", fm.Property: "property",
         fm.Classification: "classification", fm.Material: "material", fm.PartOf: "partOf"}


def tokens(v):
    if v is None:
        return []
    if isinstance(v, fm.Restriction):
        out = []
        for k, x in v.options.items():
            out += [str(y) for y in (x if isinstance(x, list) else [x])]
        return out
    if isinstance(v, (list, tuple)):
        return [str(y) for y in v]
    return [str(v)]


def facet_tokens(f):
    k = KINDS.get(type(f))
    t = []
    if k == "entity":
        t += [("class", x) for x in tokens(f.name)] + [("v", x) for x in tokens(f.predefinedType)]
    elif k == "attribute":
        t += [("v", x) for x in tokens(f.name) + tokens(f.value)]
    elif k == "property":
        t += [("v", x) for x in tokens(f.propertySet) + tokens(f.baseName) + tokens(f.value)]
        if f.dataType:
            t.append(("v", str(f.dataType).upper()))
    elif k == "classification":
        t += [("v", x) for x in tokens(f.system) + tokens(f.value)]
    elif k == "material":
        t += [("v", x) for x in tokens(f.value)]
    elif k == "partOf":
        t += [("class", x) for x in tokens(f.name)] + [("v", x) for x in tokens(f.predefinedType)]
    return k, t


def has(text, kind, tok):
    if kind == "class":
        return tok.lower() in text.lower()
    return tok in text


def card(f):
    c = getattr(f, "cardinality", None) or "required"
    return c


def opt(s):
    if str(s.maxOccurs) == "0":
        return "prohibited"
    if str(s.minOccurs) == "0":
        return "optional"
    return "required"


def main(path):
    files = opened = specs = facets = tok_n = 0
    miss = {"shape": [], "cardinality": [], "optionality": [], "token": []}
    for line in open(path):
        rec = json.loads(line)
        files += 1
        if "error" in rec:
            continue
        try:
            ids = idsmod.open(rec["file"])
        except Exception as e:  # IfcTester cannot open it: nothing to compare
            continue
        opened += 1
        mine = rec["specs"]
        theirs = ids.specifications
        if len(mine) != len(theirs):
            miss["shape"].append(f"{rec['file']}: {len(mine)} specs vs {len(theirs)}")
            continue
        for a, b in zip(mine, theirs):
            specs += 1
            if a["optionality"] != opt(b):
                miss["optionality"].append(f"{rec['file']} / {a['name']}: {a['optionality']} vs {opt(b)}")
            for side, mf, tf in (("applicability", a["applicability"], b.applicability), ("requirements", a["requirements"], b.requirements)):
                if a["optionality"] == "prohibited" and side == "requirements" and not mf:
                    continue
                if [x["kind"] for x in mf] != [KINDS.get(type(f)) for f in tf]:
                    miss["shape"].append(f"{rec['file']} / {a['name']} {side}: {[x['kind'] for x in mf]} vs {[KINDS.get(type(f)) for f in tf]}")
                    continue
                for x, f in zip(mf, tf):
                    facets += 1
                    if side == "requirements" and x["cardinality"] != card(f):
                        miss["cardinality"].append(f"{rec['file']} / {a['name']}: {x['cardinality']} vs {card(f)}")
                    _, toks = facet_tokens(f)
                    for kind, tok in toks:
                        tok_n += 1
                        if not has(x["text"], kind, tok):
                            miss["token"].append(f"{rec['file']} / {a['name']} {side}: {tok!r} not in {x['text']!r}")
    print(f"ifctester {getattr(ifctester, '__version__', '?')}")
    print(f"files {files}, opened by IfcTester {opened}, specifications {specs}, facets {facets}, names and values {tok_n}")
    for k, v in miss.items():
        print(f"{k} misses: {len(v)}")
        for m in v[:40]:
            print("  " + m)


if __name__ == "__main__":
    main(sys.argv[1])
