---
title: "One wall in two discipline models: checking GlobalIds across a federated IFC set"
seo_title: "Duplicate GlobalIds across federated IFC models"
date: 2026-11-17
tags: [bim, ifc, ids, coordination]
description: "Each file passed its own GlobalId check. Compared as a set, HHS Office's architect and structural exports share a wall, and buildingSMART's scene a roof."
---

IFC says every GlobalId is unique, and [IDS Model Check](https://marisstella.app/ids-model-check/)
already reports two elements in one file that share one.
But coordination does not happen one file at a time. A project gets an
architect's export, a structural export and an MEP export, and a viewer,
clash tool or BCF issue tracker loads them together. If the structural file
carries an element with the same GlobalId as one in the architect's file, the
tools treat the two as one element, and a quantity takeoff over the set counts
it twice. No single-file check can see that.

So the CI runner now compares every model it checks in one run.

## What it found

**HHS Office** (the public architect, MEP and structural exports of one
office building in [opensourceBIM/IFC-files](https://github.com/opensourceBIM/IFC-files)):
all three files share their project, site, building and four storeys, which is
normal for discipline files exported from one template, so those are counted
and not flagged. Beyond that there is exactly one shared GlobalId: a wall,
`Basic Wall:STB 30.0:573321`, in both the architect's file and the structural
file, with the same class, name and Revit element id. It is modelled in two
disciplines, and it will be counted twice.

**buildingSMART's Simple-Scene** (ten discipline models of one small scene,
published in IFC2X3, IFC4 and IFC4X3): within each schema, 8 elements are in
more than one discipline file. The house roof is in both architecture and
structure, two sewer manholes are in both plumbing and electrical, and
"origin" and "geo-reference" marker proxies are copied into the files. Their
types and material links come along with them, so the set has 31 to 35 shared
GlobalIds per schema. Every one is the same class in each file. Nothing in
the set gives one GlobalId to two different kinds of object.

The same check catches the other common mistake: two files in the set that
are one model twice. The HHS folder holds a revision of each discipline
beside the original (architect2 shares 22,120 of 22,161 GlobalIds with
architect), and xBIM's test folder has one small model as `.ifc`, `.ifcxml`
and `.ifczip`. Each pair is reported once ("one model twice") rather than as
thousands of shared GlobalIds.

## How it behaves

- With two or more models in a run, shared GlobalIds are warnings in every
  CI output: the text log, a GitHub annotation on the element's line, the job
  summary, a GitLab Code Quality issue (`ifc-shared-globalid`, keyed on the
  GlobalId and the models, so a merge request shows it as new or fixed), and
  the JSON report.
- They do not change the IDS verdict. `--fail-on-shared-globalids` (or the
  Action input `fail-on-shared-globalids: true`) makes them fail the build.
- The cross-model step took 177 ms over 42 models and 171,528 GlobalIds.

What it does not do yet: let a team list the GlobalIds it shares on purpose
(a copied grid or reference marker), and the browser page still checks one
model at a time. The measurements, commits and commands are in
`ventures/ids-model-check/eval/federated-globalids-2026-11-17.md`.
