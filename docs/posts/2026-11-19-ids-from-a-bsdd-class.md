---
title: "An IDS straight from a bSDD class: 185 classes, 42 dictionaries, every link resolves"
seo_title: "Generate an IDS file from a bSDD class"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS Model Check now writes an IDS from a bSDD class's property list, links included. Across 42 bSDD dictionaries, every link the tool wrote resolved."
---

The buildingSMART Data Dictionary (bSDD) already says what an object of a
class should carry. Its IfcDoor entry lists `Pset_DoorCommon` and every
property in it, with data types. A Dutch permit dictionary lists what a
bedroom space needs. People still write their IDS files by copying those rows
into an editor one at a time. Earlier today [we checked the links in public
IDS files](2026-11-19-ids-model-check-bsdd-links.md) and found what that copying
leads to: a link pasted from the next row, a type the dictionary doesn't give.

So [IDS Model Check](https://marisstella.app/ids-model-check/) can now skip
the copying:

```
node cli.mjs --from-bsdd https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcDoor --sets Pset_DoorCommon -o door.ids
```

You get one specification per class. An IFC class applies to its entity
(IfcWallSHEAR becomes IFCWALL with predefined type SHEAR). A class from any
other dictionary applies to the IFC entities bSDD relates it to, and only to
objects classified with that class. Each property becomes a facet carrying its
bSDD link, its allowed values or bounds, and "required" wherever bSDD marks it required.

## Did it work across bSDD?

We ran it on every Active, latest-version dictionary in bSDD, taking the first
four classes that list properties (40 for IFC 4.3). That came to 42
dictionaries, 185 classes and 9,198 facets. Each file then went through our
IDS audit and our bSDD link check.

- 42 of 42 files pass the link check with no errors. Every class and property
  link resolves to the entry it names.
- 38 of 42 pass the audit with no errors. The other four inherit their
  dictionary's own faults: a project set named `Pset_FM` (IDS reserves
  `Pset_` for the standard sets), a quantity the IFC template doesn't have,
  and a Boolean property whose allowed values are languages.

The first run went worse, and the reasons are worth knowing if you read bSDD
from your own code:

- 165 properties answer `"predefinedValue": "None"`, Real and Boolean ones
  included. Taken at face value, that's a required value of "None".
- bSDD's IFC class lists drop the IFC type on quantities and some text
  properties. A wall's `GrossSideArea` comes back as plain "Real" when the
  IFC template says IfcAreaMeasure.
- IfcWall lists `ElementType`, which belongs to the wall *type* object.
- One IFC 4.3 set name is cut short:
  `Pset_AudioVisualApplianceTypeRailwayCommunicationT`.

The tool now handles all four, and lists on screen everything it can't carry
over, such as complex properties, which IDS 1.0 has no way to check.

## The editor was dropping links

Along the way we found that our own [IDS editor](https://marisstella.app/ids-model-check/editor.html)
lost every link when it opened a file. Across 53 public files, 0 of 344 links
survived a save. Now all 344 do, so you can generate a file, fine-tune it in
the editor and keep the links.

Measurements and method:
`ventures/ids-model-check/eval/bsdd-spec-2026-11-19.md`. The generator runs
from the command line only for now, because bSDD's API doesn't allow calls
from a browser.

*IDS Model Check is free and MIT licensed. Its results check files against
published schemas. They are not professional advice.*
