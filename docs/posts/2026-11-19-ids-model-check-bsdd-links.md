---
title: "Does your IDS link the bSDD entry it asks for? 7 of 53 public files don't"
seo_title: "Checking IDS facet links against bSDD"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS Model Check now looks every facet uri up in the buildingSMART Data Dictionary. On 58 public IDS files, 7 link entries that don't exist or don't fit."
---

An IDS file can say where its requirements come from. A property facet asking
for `IsExternal` may carry
`uri="https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/prop/IsExternal"`,
the entry in the buildingSMART Data Dictionary (bSDD) that defines it. The
idea is good: a modeller can follow the link and see what is meant, and tools
can map the requirement to the dictionary.

Nothing checks the link, though. The IDS schema only says it is a URI. So an
IDS can ask for a property called `Width`, typed as a length, while linking
IFC's `Name`, which is a string. A modeller who follows the link fills in the
wrong thing, and the IDS author never hears about it.

[IDS Model Check](https://marisstella.app/ids-model-check/) can now look the
links up for you:

```
node cli.mjs --audit spec.ids --bsdd
```

For each facet `uri` it asks bSDD's public API what is there, then compares.
It reports an error when the link doesn't resolve, points at a class where
the facet wants a property, or when the facet's dataType can't hold the
dictionary's values (a Boolean property asked for as an `IFCLABEL`). It
reports a warning when the baseName isn't the linked property, when the IFC
dictionary names a more specific type, or when values, a classification
system or the required IFC classes disagree with the entry. If the baseName
is itself an entry in the same dictionary, the warning gives that entry's
link, because the usual cause is a link copied from the next row.

## What it found in public files

I ran it on every `.ids` file GitHub code search returns for
`identifier.buildingsmart.org`: 88 files, 58 once copies are dropped, with
197 distinct bSDD links. 7 files have an error and 15 a warning. I read every
finding against the file and the bSDD answer:

- **Links copied from the wrong row.** An IDS template asks for `Width`
  (a length) and links IFC's `Name`. A Japanese translation of buildingSMART's
  random example asks for `AreaPerOccupant` and links `OccupancyNumberPeak`.
  In both cases the check names the right link.
- **Links bSDD never had.** buildingSMART's own wooden-windows example links
  an `ifc-2x3` acoustic rating that isn't in bSDD. The file has a comment
  saying "uri not live yet", and it has been copied into five other
  repositories. The IFC 4.3 dictionary does have `AcousticRating`, and the
  check names it. A product passport prototype links three properties in a
  `demo2025` dictionary that bSDD doesn't have.
- **Names that differ only in case.** `medium` where bSDD says `Medium`,
  `DENSITY` where it says `Density`. IDS compares names case-sensitively, so
  a model that copies the dictionary fails these facets.
- **Requirements and dictionary disagree.** The Dutch Omgevingswet sets ask
  for IfcReal where IFC gives a thermal transmittance or area measure. They
  also require a `Bouwlaaginhoud` classification on zones and spaces, while
  their own dictionary relates it to building storeys.

Two of my own mistakes came up while measuring, and both are fixed. bSDD
rate-limits bursts: the first run lost 68 of 205 lookups to HTTP 429, and the
check now waits and retries. It also flagged IFC4's `IfcCountMeasure` as
unable to hold an Integer, but in IFC4 that type is a NUMBER, so the
rule now accepts it.

## Why it's command-line only

Everything else in IDS Model Check runs in the browser with nothing
uploaded. This check can't: bSDD's API sends no CORS header, so a web page
isn't allowed to ask it anything. On the command line it is the one option
that goes on the network. It sends one request per distinct link, and the
link is the only thing sent. The full method, every finding and the limits
(property sets aren't compared yet) are in
[eval/bsdd-links-2026-11-19.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/bsdd-links-2026-11-19.md).
