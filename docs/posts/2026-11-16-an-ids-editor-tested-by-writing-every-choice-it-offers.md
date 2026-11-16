---
title: "An IDS editor, tested by writing all 203,433 choices it offers, and the two IDS 1.0 rules that test found"
seo_title: "A free IDS editor built from buildingSMART's property sets"
date: 2026-11-16
tags: [bim, ifc, ids, buildingsmart, construction, javascript]
description: "A browser IDS editor writes the standard data type for each property. Testing every choice it offers found a voids/fills relation gap the 334 official tests miss."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks an IFC model
against a buildingSMART IDS file. Its audit already found faults in 21 of 64
public IDS files. Most were names misspelled by hand: `Pset_WallComon`,
`Lenght`, `IsExternal` typed as text. So the next step was an
[editor](https://marisstella.app/ids-model-check/editor.html) where you never
type those names at all.

## What it does

You pick a class (`IFCDOOR`), and the editor lists the standard property and
quantity sets that class can carry. Those are its own sets, its ancestors'
sets and, for a type object, the sets of the occurrence it types. You pick a
set (`Pset_DoorCommon`) and a property (`FireRating`). The editor writes the
data type from buildingSMART's template (`IFCLABEL`) and shows the enumeration
values the standard lists, when it lists any. IDS matches exact classes, so a
rule on `IFCDOOR` silently skips `IFCDOORSTANDARDCASE`. A ticked box adds the
subclasses, and the editor shows you which ones. The IDS is audited on every
keystroke. You can download it or send it straight to the checker in the same
tab. Nothing is uploaded.

## Testing it by writing everything

The editor only offers choices, so all of them can be tested. A script writes
every class the editor offers, in IFC2X3, IFC4 and IFC4X3. For each class it
takes every set it offers and every property in that set. Each property is
written once on its own and once with a value of the right type. That comes to
**203,433 specifications**, and the audit reads each one back. The final count
is 0 errors and 0 warnings. Two earlier runs were less clean.

- **1,725 errors in IFC2X3, and the editor was right.** In IFC2X3 an actuator
  is an `IfcDistributionControlElement` typed by an `IfcActuatorType`, and IDS
  calls it `IFCACTUATOR` through a mapping table. The audit said such an
  element could not carry `Pset_ActuatorTypeCommon`. It can, because the
  property facet reads properties from the type. That was a false positive in
  the audit, and it is fixed.
- **5,350 warnings** were for properties whose template gives no single data
  type (bounded values, tables, references). The editor now checks those for
  presence only, rather than writing a value IDS cannot type.

## The XML schema found two rules everything had wrong

The audit checks meaning, not XML structure. So the second test took a
15,102-specification sample and validated it against buildingSMART's `ids.xsd`
in IfcOpenShell's IfcTester. Every file failed on the first run:

1. **Voids and fills are one relation.** In IDS 1.0, "this door sits in an
   opening of that wall" is written `relation="IFCRELVOIDSELEMENT
   IFCRELFILLSELEMENT"`, one value made of two tokens. The editor, the audit
   and the checker all treated them as two separate relations. As a result,
   the audit marked the correct form invalid and accepted the forms that
   IfcTester refuses to open. The checker passes all 334 of buildingSMART's
   test cases, but none of those cases uses voids or fills, so the tests could
   not catch it. The checker now reads the pair the way IfcTester does: a
   door that fills an opening in a wall is part of the wall.
2. **A classification facet needs a system.** The audit now says so. It
   fires on 2 of the 64 public IDS files, and the XML schema rejects both.

After the fixes, all 15,102 sample specifications validate against the XML
schema. The test-suite score is still 334 of 334.

## What's next

Next, the editor should open an existing IDS for editing. It should also offer
the classes and sets a dropped model actually contains, so the requirements
start from what the model has. The scripts are `eval/editor-roundtrip.mjs` and
`eval/editor-xsd-check.py` in the
[repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check).
