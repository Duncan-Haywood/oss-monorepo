---
title: "No IFC 4.3 model we found still writes IfcWallStandardCase, so our IDS editor stopped asking for it"
seo_title: "IDS editor: IFC 4.3's deprecated classes left out of subclass boxes"
date: 2026-11-19
tags: [bim, ifc, ids, editor]
description: "We counted IfcWallStandardCase in 107 public IFC models. IFC4 exports still use it; 57 IFC 4.3 files never do. The IDS editor's subclass box now matches that."
---

An IDS file is a list of rules for a building model (IFC). Each rule names the
classes it applies to, and IDS matches classes exactly, so a rule for walls
has to name every kind of wall. Our free
[IDS editor](../../ventures/ids-model-check/README.md) has an "and its
subclasses" box that writes them out for you.

In IFC 4.3 that box wrote two classes the standard tells software not to use.
`IfcWallStandardCase` is deprecated: a plain `IfcWall` with a layer set
replaces it. `IfcElectricDistributionBoard` is deprecated in favour of
`IfcDistributionBoard`. The bSDD Toolkit's IDS template already left both out
of its 147-class list. Because of that gap, our editor couldn't recognise the
list as "built elements and their subclasses" and showed 79 separate classes.

Leaving a class out changes which objects a rule checks, so we wanted
evidence from real exports before changing anything. We counted walls in 107
public IFC files from buildingSMART's two sample repositories and the
web-ifc test set:

| Schema | Files | IfcWall | IfcWallStandardCase |
| --- | ---: | ---: | ---: |
| IFC 4.3 | 57 | 25 | 0 |
| IFC4 | 22 | 421 | 151 |
| IFC2x3 | 28 | 1,209 | 9,657 |

The old class is still very much alive in IFC2x3 and IFC4: ARCHICAD 20's
IFC4 exports use it for every wall. None of the IFC 4.3 files does. Their
walls come from SketchUp's IFC manager, ACCA usBIM and buildingSMART's own
samples. That isn't many writers, and the post says so below.

What changed:

- In IFC 4.3, a ticked box now leaves out the deprecated classes and says so
  next to it: "(not IFCWALLSTANDARDCASE: deprecated in IFC4X3; add it to
  'Also applies to' if old exports still use it)".
- IFC4 and IFC2x3 are unchanged. A rule that also targets IFC4 in its own
  version list keeps the old classes, because it will check older models too.
- If you open a model that does contain a deprecated class, the editor's
  existing warning still says the rule would not check those objects, and
  offers to add them.
- Files that name a deprecated class keep it, and every one of the 64 public
  IDS files we test still writes back exactly what it asked.

The bSDD templates now open as 30 classes, with `IFCBUILTELEMENT` and
`IFCDISTRIBUTIONELEMENT` ticked. Across the public files, the editor lists
270 class names where it listed 368.

The open question is Revit and ARCHICAD, neither of which has a public IFC
4.3 export in these sets. If you have one, the
[method and numbers](../../ventures/ids-model-check/eval/deprecated-subclasses-2026-11-19.md)
show how to check it in a minute.
