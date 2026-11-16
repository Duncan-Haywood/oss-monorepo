---
title: "An IDS file can be wrong before any model is read: auditing 334 of buildingSMART's test files"
seo_title: "How to check an IDS file is valid before checking IFC models"
date: 2026-11-16
tags: [ids-model-check, bim, ifc, ids, buildingsmart]
description: "IDS Model Check now audits the IDS itself against the IFC schema. It flags 26 of buildingSMART's 27 invalid test files and none of the 307 valid ones."
---

An Information Delivery Specification (IDS) is the file a BIM manager writes
to say what a building model must contain: every wall has a fire rating,
every door is on a storey, every element has a classification code. A checker
then reads a model and reports which elements miss which requirement.

The IDS can be wrong too. `IfcWall` written in mixed case, an attribute the
class doesn't have, a real number written `42,3` with a decimal comma, an
integer written `42.0`, a pattern applied to a number. Run as written, a
specification like that fails every element in the model. The report then
shows hundreds of failing walls when the problem is one line in the IDS.

[IDS Model Check](https://marisstella.app/ids-model-check/) now audits the
IDS first. Each specification is checked against the IFC schema its
`ifcVersion` names. A specification that cannot be checked as written comes
back **INVALID**, with the reason, and is not run.

**How it was measured.** buildingSMART publishes 334 small IDS and IFC pairs.
Each name says the expected result: pass, fail or invalid. Before this change
the checker already scored 334 of 334, but the 27 invalid files only counted
as right because they failed. A stricter score now asks more: an invalid file
must come back INVALID, and a valid file must come back exactly pass or fail.
The audit must not call a good IDS bad. Result: 333 of 334. That is 26 of the
27 invalid files flagged and none of the 307 valid ones.

| what was wrong in the IDS | files |
| --- | --- |
| a value IDS can't read for the type (`42,3`, `42.0` for an integer, `FALSE` for a boolean, a pattern on a number) | 13 |
| an entity requirement no applicable class can meet (applies to slabs, requires a wall; a subclass is not its parent) | 4 |
| an attribute the class doesn't have, or has only as a derived or inverse attribute | 3 |
| a value compared with a list, an object reference or a select | 3 |
| a class that doesn't exist, or isn't upper case | 2 |
| a prohibited specification that also has requirements | 1 |

**The one it misses, and why.** One invalid file asks for a group whose
predefined type is `BUNNARY`. Its valid sibling asks for `BUNNY`. IDS allows
custom predefined types for user-defined objects, so the IDS alone can't
tell the two apart; only the model shows that no group is called `BUNNARY`.
The audit warns about any predefined type outside the class's enumeration
but does not call it invalid.

**Files written by other people.** Test files are written to break rules.
So the audit was also run on the 12 example IDS files in buildingSMART's
repository: Aedes, ArcDox, SimpleBIM, occupant movement analysis,
prefabricated pipes in IFC2X3 and IFC4.3, wooden windows and others, 38
specifications in all. It found 0 errors and 0 warnings.

**Use it.** On the page, drop an IDS on its own and press *Audit the IDS
only*; nothing is uploaded. From a terminal or CI:
`node cli.mjs --audit spec.ids` exits 1 when a specification is invalid. When
a model is checked, invalid specifications are listed apart from real
failures, so a BCF export no longer holds a topic for every wall over a typo.

**Not yet covered:** names and data types from buildingSMART's standard
property set templates. A misspelt `Pset_WallComon` still passes the audit
and simply finds nothing in the model. That is the next step.

The code is MIT licensed, with no dependencies:
[ventures/ids-model-check](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check).
The test suite is buildingSMART's (CC BY-ND 4.0), so it is fetched and
scored, never copied. This is a free tool, not a design review, and not
professional advice.
