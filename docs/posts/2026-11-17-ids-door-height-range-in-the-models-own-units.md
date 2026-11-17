---
title: "Asking for a door height range in an IDS: the model's own units, not metres"
seo_title: "IDS attribute ranges: OverallHeight in the model's units"
date: 2026-11-17
tags: [bim, ifc, ids, construction, ifctester]
description: "The IDS editor now offers a model's range for OverallHeight and other numeric attributes. Attributes compare as written, so mm and feet models need mm and feet."
---

The [IDS editor](https://marisstella.app/ids-model-check/editor.html) in
[IDS Model Check](https://marisstella.app/ids-model-check/) can already open a
building model and offer the values its objects hold, so a requirement can
allow exactly those. Until today that only worked well for text. A door's
`OverallHeight`, a storey's `Elevation` or a stair's `NumberOfRiser` were
treated as strings: you could ask for one exact value, not "between 2000 and
2400".

Now a numeric attribute gets a **between** mode. With a model open, **Use the
model's range** fills in the bounds. The restriction is written the way
buildingSMART's own test cases write it:

```xml
<attribute>
  <name><simpleValue>OverallHeight</simpleValue></name>
  <value><xs:restriction base="xs:double">
    <xs:minInclusive value="1990"/><xs:maxInclusive value="3020"/>
  </xs:restriction></value>
</attribute>
```

Boolean attributes, such as a door style's `Sizeable`, are now asked as
true/false, not as text.

## Does a range built from a model pass that model?

I checked it on four public exports from `opensourceBIM/IFC-files` (the HHS
office's architectural, MEP and construction models, and the Schultz
Residence, a Revit export) plus the sample house. Every numeric attribute row
the models carry was written as "if present, between the model's range", and
every boolean row whose objects all hold one value as "exactly that".

- 27 of 27 numeric requirements and 6 of 6 boolean ones pass their own model.
- IfcOpenShell's IfcTester (0.9.0.post1) gives the same verdict and the same
  failing elements on all 33.

The bounds are rounded outward because IDS ranges take no tolerance: one
storey elevation is stored as 10899.99999999989, so a range ending at 10900
passes it, and a range that rounded down would not.

## The trap: which units?

The ranges the editor offered were 1990 to 3020 for the HHS doors, 1.58 to
5.99 for the Schultz windows and 0.574 to 0.579 for the HHS stair risers.
Those are millimetres, feet and feet. They are the model's own units.

IDS's user manual says measure values in an IDS file are SI units, and the
property facet's test cases check that properties are converted. No test case
covers attributes, and both checkers compare attributes unconverted. A
requirement "OverallHeight between 2 and 2.2" (metres) fails the sample
house's 2100 mm door in IDS Model Check **and** in IfcTester.

So if you write attribute ranges by hand, write them in the model's units. If
you start from the model, the editor's offer is already in them, and the range
field now says that attributes are compared as the model writes them. I
haven't changed the checker: converting would put it out of step with
IfcTester, and the standard doesn't settle the question.

Method and numbers: `ventures/ids-model-check/eval/model-attr-ranges-2026-11-17.md`.
The editor runs in your browser, and the model never leaves your machine.
