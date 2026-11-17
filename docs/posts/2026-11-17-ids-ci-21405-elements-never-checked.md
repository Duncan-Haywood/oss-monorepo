---
title: "A green IDS check in CI can skip 21,405 elements: now the build says so"
seo_title: "IDS checks in CI: the subclass elements a green build skips"
date: 2026-11-17
tags: [bim, ifc, ids, ci, validation]
description: "65 public IDS files on four real IFC exports: 165 checks skipped 21,405 subclass elements. The CI runner and the IDS editor now flag them."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks IFC
building models against buildingSMART IDS files, in the browser or as a
GitHub Action and CLI that run on every commit. Earlier today we
[found](2026-11-17-ids-model-check-ifcwall-skips-standard-case-walls.md) that
IDS has no inheritance. A specification naming `IFCWALL` never looks at an
`IfcWallStandardCase`, and that is how Revit's IFC2X3 exports write most
walls. The text and page reports started warning about it. The CI outputs
did not, so a pipeline could go green on 4 walls while 101 were never looked
at.

## What a build now shows

Nothing changes in the verdict. IDS says what it says, and the checker
follows the standard. What changes is that every CI output now reports how
many elements were left out:

- a warning annotation on the IDS file, titled with the count (the fix is
  there: add the class names);
- the JUnit test case's `system-out`, so test-report viewers show it next to
  a pass;
- a "Not checked" column and a per-specification list in the job summary;
- a `not-checked` output for later steps.

If you want the build to fail on it, set `fail-on-unchecked: true` on the
Action (`--fail-on-unchecked` on the CLI). It is off by default.

## On 65 public IDS files

We ran the 65 IDS files people publish on GitHub against four real IFC2X3
exports (three HHS Office models and OpeningDesign's Schultz Residence), 260
pairs, through the same entry point the Action uses. It took 53.5 seconds.

- 165 of 2,028 specification checks left subclass elements unchecked, across
  25 of the 65 files.
- 76 of those 165 passed anyway, and 39 applied to no element at all.
- 21,405 elements in total were never looked at.

Most of them (13,049) are the familiar case: `IFCWALL` without
`IFCWALLSTANDARDCASE`. The other 8,356 came from somewhere we had not looked.
Two copies of the Dutch RVB BIM Norm v1.1 IDS apply one specification to
`IFCBUILDINGELEMENT`. In IFC2X3 that class is abstract, so no element is ever
exactly an IfcBuildingElement. The specification applied to nothing on all
four models and failed with what read like "this model has no building
elements". The models have thousands of members, plates, proxies, columns,
railings and walls under that class. The warning now names them.

## In the editor too

The [IDS editor](https://marisstella.app/ids-model-check/editor.html) can
open a model and offer its classes. Now, when a specification's classes leave
out some of the open model's subclass objects, it says "The model also has
101 object(s) of IFCWALLSTANDARDCASE, a subclass of IFCWALL ... this
specification would not check them". One click adds them to the
specification's classes.

## Check it yourself

The measurement, commands and per-class counts are in
`ventures/ids-model-check/eval/ci-unchecked-2026-11-17.md`. The IDS files
come from `eval/fetch-audit-corpus.sh` and the models from
`opensourceBIM/IFC-files` at `cb96c50`. The tool is MIT licensed and runs on
your machine; nothing is uploaded. Results are a check against the IDS as
written, not a sign-off of the model.
