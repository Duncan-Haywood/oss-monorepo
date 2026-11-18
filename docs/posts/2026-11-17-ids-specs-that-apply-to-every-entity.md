---
title: "IDS specifications that apply to every entity: 68 public files, 96 s down to 13 s"
seo_title: "Faster IDS checks for specifications with no entity facet"
date: 2026-11-17
tags: [bim, ifc, ids, javascript, performance]
description: "37 specifications in public IDS files apply to every IFC entity. Three changes cut a 68-file check of a 40 MB model from 96 s to 13 s, same reports."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks IFC
building models against buildingSMART IDS files, in the browser or from the
command line. Earlier today we made it
[read a 219 MB model in 1 GB](2026-11-17-ids-model-check-200-mb-model-in-1-gb.md)
by parsing each entity's arguments only when a check needs them. That post
ended on what it did not fix: some public IDS files ask about *every* entity
in the model, geometry included, and those checks were still slow and
memory-hungry.

## What the public files ask

We keep a corpus of 65 IDS files published in public GitHub repositories
(national requirement sets, research projects, tool samples). In them, 26
specifications have no entity facet, so they apply to everything: "every
object with a `GlobalId`", "everything with `Pset_WallCommon`". Another 11
name the entity with a pattern that matches every class. On the HHS Office
MEP export from [opensourceBIM/IFC-files](https://github.com/opensourceBIM/IFC-files),
that is 665,224 entities per specification. About 500,000 of them are
cartesian points, loops and faces.

Checking all 68 IDS files (the 65 public ones plus our three starter files)
against that model took **96 seconds**.

## Where the time went

A CPU profile of the slowest file, OpenAEC's Dutch NL-BIM Basis ILS fixture,
put 54% of the time in one small function. IFC2X3 has no `IfcDoorType`, so an
IDS that asks for one has to be matched through a mapping table (an
`IfcDoorStyle` on an `IfcDoor` counts). The code rebuilt that table as a list
of a few hundred pairs for every entity it tested. A specification aimed at
doors pays that a few hundred times. One that applies to every entity pays it
millions of times.

Most of the rest was work whose answer was already known. A requirement like
"required property `Pset_WallCommon.LoadBearing`" was checked by parsing each
cartesian point's arguments to find out it has no property set. The model
already indexes which elements have property sets, classifications,
materials and parents, so the answer was sitting in a map.

## Three changes

1. **A cheap test per facet.** It reads only the entity's class or the
   relationship indexes, and says "cannot match" only where the full test
   would fail with the facet absent. A point has no `GlobalId` attribute, no
   property set and no material, so it is skipped without reading its
   arguments.
2. **Verdict first, reasons later.** When a requirement's facet is absent, the
   cardinality alone gives the answer: required fails, optional and
   prohibited pass. The full test, with its failure text, now runs only for
   the failing elements a report keeps (the first 1,000 per specification).
3. **The IFC2X3 mapping table indexed once** by occurrence class.

| 68 IDS files, each model parsed once | before | after |
|---|---:|---:|
| HHS MEP, 39.6 MB | 96.2 s | 13.3 s |
| HHS architect, 13.1 MB | 22.5 s | 5.1 s |
| Schultz Residence, 22.5 MB | 46.7 s | 8.1 s |
| Federated model, 219 MB | 515 s | 111 s |

Every report is identical to before, apart from the timing field: we hashed
the reports on all five models.

We also got one thing wrong this morning. The earlier post said the 68-file
run on the 219 MB model "still peaks at 4.7 GB", as if it needed that much.
It doesn't. Measuring after each file with a full garbage collection shows
the run holds only about 300 MB beyond the parsed model, and with Node's heap
capped at 2 GB it finishes, both before this change (476 s) and after it
(139 s). The rest was garbage the collector had not yet needed to clear,
because Node's default limit on a 16 GB machine is 8.6 GB. So this change
saves time, not memory. Under a 1 GB cap that run still runs out.

## How we know it didn't change an answer

A shortcut that skips work is only safe if it never skips something that
would have matched. The new test runs 13 facets (attributes by name and by
pattern, property sets, classifications, materials, and the part-of
relations) against the sample model and against a wall whose property set,
material and classification all come through its type, which is the case a
naive index would miss. Each is run as applicability and as a requirement in
all three cardinalities, and compared with a brute-force run of the full test
over every entity. Breaking any one of the shortcut's sources (say,
forgetting that a wall can inherit a material from its type) fails it. The
buildingSMART conformance pairs still score 334 of 334.

## What is left

The OpenAEC fixture also has requirements on attribute *values* by a name
pattern, such as "any attribute equals `?`". Those genuinely need every
entity's values, so geometry is still parsed for them. That is most of its
remaining 13.5 seconds. The ifcXML reader still builds every entity up front.

The measurements, scripts and commands are in
[`eval/no-entity-facet-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/no-entity-facet-2026-11-17.md).
IDS Model Check is free and MIT licensed, and it runs in your browser: your
model is not uploaded.
