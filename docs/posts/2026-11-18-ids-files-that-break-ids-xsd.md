---
title: "Nearly one in five IDS files on GitHub breaks the IDS schema; our checker now says which line"
seo_title: "IDS files that break ids.xsd, and the line to fix"
date: 2026-11-18
tags: [bim, ifc, ids, validation]
description: "12 of 65 public IDS files break buildingSMART's ids.xsd. IDS Model Check now checks the structure too, matching IfcTester's verdict on 3,080 files."
---

An IDS file (buildingSMART's Information Delivery Specification) tells a BIM
model what it must contain: every door needs a fire rating, every wall says
whether it is load-bearing. Before any tool can check a model against it, the
IDS file itself has to be valid XML against the IDS schema, `ids.xsd`. Tools
that validate first, IfcTester among them, refuse a file that breaks it,
whole, before reading a single rule.

[IDS Model Check](https://marisstella.app/ids-model-check/) already audited
what an IDS *means*: IFC class names that do not exist, property names one
letter off the standard (`AkousticRating`), data types the template does not
give. It did not check the file's structure. Its reader is lenient, so a file
another tool refuses could still read as VALID on our page. That gap was in
the README's Limitations until today.

## What we found

We ran the 65 IDS files we found published in public GitHub repositories
through IfcTester's schema validation. 12 break `ids.xsd`:

- **IDS 0.9 habits.** `minOccurs`/`maxOccurs` on `<specification>` (IDS 1.0
  moved them to `<applicability>`), and `ifcVersion="IFC4X3"` where 1.0 says
  `IFC4X3_ADD2`.
- **The schema's address as the namespace.** `xmlns=".../IDS/1.0/ids.xsd"`
  instead of `xmlns="http://standards.buildingsmart.org/IDS"`; three files.
- **Generated files.** An `<author>` of "AI Assistant" (the schema wants an
  e-mail address), and `<n>` written for `<name>`.
- **Plain XML faults.** A bare `&` in a title; an element left unclosed.

None of these change what the author meant, and our checker read most of them
correctly. But a file the next tool in a project's chain refuses is a broken
handover, and the author would rather hear it from the first tool.

## What changed

The audit (the "Audit the IDS only" button, or `node cli.mjs --audit`) now
checks element order, allowed and required attributes, the fixed values of
`cardinality`, `relation`, `ifcVersion` and `dataType`, value content
(`<simpleValue>` or `<xs:restriction>`, XSD 1.0 facets only), the info block
and the root namespace, and names the line and what to write instead:

    [ERROR] Doors need width of at least 1.05m / line 8: ifcVersion="IFC2X3 IFC4 IFC4X3"
    on <specification>: "IFC4X3" is not one of IFC2X3, IFC4, IFC4X3_ADD2
    (IDS 1.0 names IFC 4.3 "IFC4X3_ADD2") (ids.xsd)

When a model is checked, such a specification still runs, with a warning,
so no earlier verdict changes.

## How we know it agrees

We compared the valid-or-invalid verdict with IfcTester's own `ids.xsd`
validation on every file: the 145 public and IDS-Audit-tool files, then
2,935 copies of the valid ones with one random fault each (siblings swapped,
an element dropped or renamed, an attribute misplaced or misspelt, a wrong
fixed value, stray text). The first two mutated sets found three gaps, which
we fixed; the last set of 1,129 was run once, after the rules were final,
and agreed on all of them. Overall: 3,080 of 3,080 the same. The method,
the tables and the commands are in
[`eval/ids-structure-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/ids-structure-2026-11-18.md).

The checker is free, runs in the browser with nothing uploaded, and is MIT
licensed. If you write IDS files for a project, drop one on the page and
press *Audit the IDS only*.
