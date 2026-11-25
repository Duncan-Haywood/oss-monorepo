#!/usr/bin/env python3
"""Pulls the ifcXML layout out of a buildingSMART ifcXML schema (.xsd) for
ifcxml-writer.mjs: for every entity, which of its own attributes (all of
them, its supertypes' included, when the entry has a third value 1: an XSD
restriction) are written as XML attributes, which as child elements and in what order, and which
inverse attributes the schema lets a relationship be nested under. The XSD's
configuration also leaves some attributes out (a relationship's pointer back
to the object it is nested under); those are the entity's own attributes in
neither list.

    python3 schema/gen-ifcxml-layout.py IFC4_ADD2.xsd schema/ifc4.json > schema/ifcxml-layout-ifc4.json

The XSDs are (c) buildingSMART International Limited; their notice allows use
in software development with full attribution (README, "Sources"). Read from
github.com/buildingSMART/Standards-builds (eval/fetch-ifcxml-xsd.sh):
IFC/RELEASE/IFC4/ADD2/XML/IFC4_ADD2.xsd and
IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.xsd. Only names are kept, no text.
"""
import json
import sys
import xml.etree.ElementTree as ET

XS = "{http://www.w3.org/2001/XMLSchema}"


def main(xsd, schema_json):
    root = ET.parse(xsd).getroot()
    by_key = json.load(open(schema_json))["entities"]
    ents = {v["name"]: v for v in by_key.values()}
    out = {}
    rows = set()
    for ct in root.findall(XS + "complexType"):
        name = ct.get("name")
        if name not in ents:
            continue
        ext = ct.find(XS + "complexContent/" + XS + "extension")
        # A restriction (IFC4X3's IfcMirroredProfileDef) lists every
        # attribute and element itself, its supertypes' included.
        full = ext is None
        if full:
            ext = ct.find(XS + "complexContent/" + XS + "restriction")
        if ext is None:
            sys.exit(f"{name}: neither extension nor restriction")
        seq = ext.find(XS + "sequence")
        elements = [e.get("name") for e in (seq if seq is not None else [])]
        attributes = [a.get("name") for a in ext.findall(XS + "attribute")]
        known = set()
        e = ents[name]
        while e:  # own names, or every level's for a restriction
            known |= {a["name"] for a in e["attrs"]} | set(e.get("inverse", []))
            e = by_key.get(e.get("super")) if full else None
        stray = [n for n in elements + attributes if n not in known]  # before coding
        if stray:
            sys.exit(f"{name}: names the EXPRESS schema lacks: {stray}")
        # An inverse written as the relationship itself (<HasOpenings
        # GlobalId=..>, IsTypedBy) rather than as a list of them: "=Name",
        # with ":1" when the XSD allows it once (IFC4's maxOccurs="1").
        inverses = set()
        x = ents[name]
        while x:
            inverses |= set(x.get("inverse", []))
            x = by_key.get(x.get("super")) if full else None
        coded = []
        for e in (seq if seq is not None else []):
            n = e.get("name")
            # A list of lists whose rows the XSD wraps (<Seq-IfcPositiveInteger-wrapper>);
            # every other list of lists it writes flat ("list list").
            inner = e.find(XS + "complexType/" + XS + "sequence/" + XS + "element")
            if inner is not None and (inner.get("name") or "").startswith("Seq-"):
                rows.add(n)
            if n in inverses and e.get("type"):
                n = "=" + n + (":1" if e.get("maxOccurs") == "1" else "")
            coded.append(n)
        elements = coded
        out[name] = [attributes, elements, 1] if full else [attributes, elements]
    missing = sorted(set(ents) - set(out))
    if missing:
        sys.exit(f"entities with no complexType: {missing[:10]}")
    # Defined types' names as the XSD spells them, for <IfcLengthMeasure-wrapper>.
    types = json.load(open(schema_json))["types"]
    spelled = {}
    for st in list(root.findall(XS + "simpleType")) + list(root.findall(XS + "complexType")):
        n = st.get("name") or ""
        if n.upper() in types and types[n.upper()].get("kind") != "select":
            spelled[n.upper()] = n
    target = root.get("targetNamespace")
    print(json.dumps({"namespace": target, "types": dict(sorted(spelled.items())), "rows": sorted(rows), "entities": dict(sorted(out.items()))}, separators=(",", ":")))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
