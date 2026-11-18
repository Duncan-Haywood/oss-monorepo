---
title: "An IDS specification doesn't have to name a class, and buildingSMART's own test files mostly don't"
seo_title: "Editing IDS specifications with no entity facet"
date: 2026-11-17
tags: [ids-model-check, ventures]
description: "Our IDS editor opened buildingSMART's audit-tool files as 28% editable. Letting a specification select by attribute alone took that to 76%."
---

An IDS file is a list of specifications, and each one says which objects it
applies to and what they must have. Most people write "walls" or "doors" as
the first line of that applicability, and the [IDS editor](https://marisstella.app/ids-model-check/editor.html)
was built around that: pick a class, then a property set that class can
carry, then a property.

IDS 1.0 doesn't require the class, though. "Anything with a `Version`
attribute must say which version" is a valid specification. So is "anything
where `Pset_WallCommon.IsExternal` is true must have a fire rating". It
covers walls, and also any curtain wall or slab some exporter tagged with the
wall set. buildingSMART's own IDS-Audit-tool test files are written this way
almost throughout.

## What the editor did with them

With no class there was nothing to look up, so the editor offered only four
attributes (Name, Description, ObjectType, Tag) and no standard sets. Opening
one of those files left almost everything as read-only XML. 28.1% of the
facets in the twelve IDS-Audit-tool valid files could be edited.

## What it does now

A specification with no class checks every object that matches its other
conditions, so the editor now offers what could match anywhere:

- every standard property and quantity set a template gives to some class
  (509 in IFC4);
- every attribute that is stored, single and comparable on at least one class
  (468 in IFC4).

The awkward part is typing. A class tells you `OverallHeight` is a length, so
the row offers a range. With no class, the editor checks every class that has
the attribute. If they all give it the same type, the row is typed: `OverallHeight` is a
positive length everywhere, so it still gets a range. If they don't, the row
stays free text. `Name` is a label on almost every class but an SI unit name
on `IfcSIUnit`, so it stays text, as before.

## Measured

An opened facet only becomes an editable row if the row writes back exactly
the XML the file had, so none of this can change what a file asks for. Before
and after, on the same corpora:

| Files | Editable before | after |
| --- | ---: | ---: |
| 12 IDS-Audit-tool valid files | 28.1% | 75.9% |
| 64 public IDS files from GitHub | 86.4% | 89.2% |
| 187 buildingSMART pass cases | 85.3% | 85.3% |

Every file in all three groups still writes back asking the same, and the
audit's errors changed on none of them.

Most of what the audit-tool files still keep is numeric attributes listed as
a one-value enumeration (`BarCount` one of 27). The editor has no "one of" for
numbers yet. That's next if real files turn out to need it. The method and the
remaining tally are in the venture's
`eval/no-class-specs-2026-11-17.md`, and `node eval/kept-facets.mjs` reproduces
the tally.
