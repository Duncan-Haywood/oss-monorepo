---
title: "When the IDS is the problem, CI now points at the IDS"
seo_title: "IDS audit warnings as GitHub annotations on the IDS file"
date: 2026-11-17
description: "72 of 507 specifications in 64 public IDS files carry an audit warning. The IDS model check Action now annotates each on its own line in the IDS."
tags: [ids-model-check, bim, ifc, ids, ci]
---

The [IDS model check](/ids-model-check/) GitHub Action checks every IFC model
in a repository against every IDS file on each push. Until today, when a
specification could not work as written, CI blamed the model. The Dutch RVB BIM
Norm asks every `IFCBUILDINGELEMENT` to carry a material. That class is
abstract: no object has it as its own class, and IDS names do not include
subclasses, so the specification selects nothing. CI showed "required, but
nothing in the model matches the applicability" on a model with thousands of
walls and slabs. The reason sat in a JSON field nobody reads.

Now each IDS audit warning is a GitHub annotation on the IDS file, on the line
of that `<specification>` tag, with the fix in the message (here, the 25
concrete classes to name instead). It is reported once per IDS file, however
many models the file was checked against. An invalid specification is now
reported the same way: once, on its line. The job summary lists every warning,
the JUnit report carries them in `system-out`, and `audit-warnings` counts
them. The verdict does not change unless you set
`fail-on-audit-warnings: true`.

## How often the IDS is the problem

We ran the 64 public IDS files we could find on GitHub (national requirement
sets, research projects, tool samples) through it, checked against two sample
models:

- 72 of their 507 specifications carry at least one audit warning, spread over
  25 files: 117 warnings in all.
- 59 of the warnings are non-standard `Pset_` properties or data types, 56 are
  property values with no `dataType` (IDS 1.0 expects one, and checkers
  disagree on how to compare a value without it), and 2 are the abstract class above.
- buildingSMART's own valid example files get none.

The line numbers were checked too. For all 1,451 specifications in the public
files, buildingSMART's test cases and the IDS-Audit-tool's files, the start
tag on the annotated line is that specification.

One file, Rotterdam's permit-checking IDS, has 19 specifications with warnings.
GitHub shows ten warning annotations per step and drops the rest silently, so
past nine the remainder fold into one annotation that says how many there are
and points at the job summary.

Method, numbers and the script that reproduces them:
`ventures/ids-model-check/eval/ci-audit-annotations-2026-11-17.md`. The check
is a tool for finding gaps in a model's information, not a sign-off of a
design.
