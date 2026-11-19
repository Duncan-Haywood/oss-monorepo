---
title: "Half the public IDS files that validators refuse can be repaired without a person"
seo_title: "Repairing the public IDS files that validators refuse"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "12 of 65 public IDS files break ids.xsd. A one-click repair brings 6 back to valid without changing what they ask, and found 48 facets our reader got wrong."
---

An IDS file states what a building model must contain: which walls need a
fire rating, which doors need a name. IfcTester, buildingSMART's
IDS-Audit-tool and other checkers validate the file against the IDS XML
schema (`ids.xsd`) before they read it. A file that fails is refused whole.

This morning [IDS Model Check](https://marisstella.app/ids-model-check/)
started saying where a file breaks `ids.xsd`. Of 65 IDS files published on
GitHub, 12 do. Reading the faults one by one, most of them have exactly one
right fix:

- IDS 0.9 put `minOccurs` and `maxOccurs` on `<specification>`. IDS 1.0
  puts them on `<applicability>`.
- IDS 0.9 named a property facet's property `<name>` and its type
  `datatype`. In 1.0 these are `<baseName>` and `dataType`.
- `ifcVersion="IFC4X3"` is spelt `IFC4X3_ADD2` in IDS 1.0.
- The namespace was set to the schema's web address
  (`.../IDS/1.0/ids.xsd`) when it should be `http://standards.buildingsmart.org/IDS`.
- A value written as plain text, `<name>IFCWALL</name>`, with no
  `<simpleValue>` around it.

None of those needs a person to decide anything, so the audit now offers a
**Download repaired IDS** button (`node cli.mjs --fix spec.ids` on the
command line). It changes only the faulty spots in the file's text, so
comments and indentation stay where the author put them, and it lists every
change with its line number.

## What it does to the 12 files

| result | files |
|---|---:|
| valid against `ids.xsd` after the repair | 6 |
| one or two faults left that need a person | 4 |
| untouched (not well-formed XML; `<n>` written for `<name>` throughout) | 2 |

The faults left for a person don't have a single right answer. Two files
give the author as "AI Assistant", and `ids.xsd` wants an e-mail address.
One classification names no system. One file has no `<info>` block and no
`<applicability>` at all.

## Checking that a repair asks for the same thing

A repair that changed what a specification asks for would be worse than no
repair. So every repaired copy was read back by the checker and compared
facet by facet, value by value, with the original. We ran this on the 145
public and IDS-Audit-tool files and on 2,941 copies with one random fault
each:

- 682 of 682 files with no fault came back byte for byte.
- 217 of 217 repaired files read the same as their originals.
- 198 of the 217 then pass IfcTester's own `ids.xsd` validation. Our
  structure check gave the same verdict as `ids.xsd` on all 217.

## What it found in our own reader

To keep an IDS 0.9 file running, the checker's reader had always been
lenient. Checking that repairs read the same showed where that leniency went
wrong. The reader treated a property facet's `<name>`, a `datatype`, and a
value with no `<simpleValue>` as "anything". So a 0.9 facet requiring
`FireRating` in `Pset_WallCommon` passed any property in that set, and an
entity facet written `<name>IFCBUILDING</name>` applied to every class in
the model.

The reader now reads those forms the way their authors wrote them. That
changes 48 facets in 8 public files, and nothing in buildingSMART's 334 test
cases. If you ran one of those files through the checker before today, an
element could pass when its author meant it to fail.

The method, numbers and reproduction steps are in
[eval/fix-structure-2026-11-18.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/fix-structure-2026-11-18.md).
