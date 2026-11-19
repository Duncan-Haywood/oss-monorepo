---
title: "Most IDS files link nothing to bSDD. The IFC links can be written for you"
seo_title: "IDS files rarely link to bSDD; the IFC links can be added for you"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "Only 316 of 1,317 property requirements in 117 public IDS files carry a bSDD link. A free offline step now adds the IFC 4.3 one to 619 of the rest."
---

An IDS file can say which buildingSMART Data Dictionary (bSDD) entry each
requirement means: IDS 1.0 gives a property facet a `uri` for it. Tools that
author models from the dictionary, and people reading the IDS, then know
that "FireRating in Pset_WallCommon" is IFC's FireRating and nothing else.

Hardly anyone writes them. Across 117 public IDS files on GitHub, 316 of
1,317 property requirements carry a `uri`. The other 1,001 do not.

For most of them no lookup is needed. bSDD's IFC 4.3 dictionary codes each
standard property by its own name, so FireRating is always
`https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/prop/FireRating`,
and quantities such as GrossFloorArea follow the same rule.

[IDS Model Check](https://marisstella.app/ids-model-check/) now writes these
links. Audit an IDS on the page and a "bSDD" box lists every requirement on a
standard `Pset_` or `Qto_` property that has no link, with a button to
download the file with the links added. Nothing else in the file changes. On
the command line it is `node cli.mjs --link-bsdd spec.ids -o linked.ids`. It
runs offline. That matters because bSDD's API cannot be called from a
browser, which is why the earlier link check is CLI only.

## Measured on public files

- 619 links suggested in 54 of the 117 files, 111 of them on quantities.
- 212 requirements in the corpus already link the IFC dictionary. On 196 of
  them the rule gives the link the author wrote. It differs on 2, and both are
  author slips the [bSDD link check](2026-11-19-ids-model-check-bsdd-links.md)
  had already flagged: `Width` linked to IFC's `Name`, and `AreaPerOccupant`
  linked to `OccupancyNumberPeak`. The other 14 do not name a standard
  property set, so the rule leaves them alone.
- For all 54 files, the output is the input plus the new attributes, byte
  for byte. A second pass adds nothing.

It leaves alone anything it cannot be sure of: patterns, misspelt names,
company property sets that reuse an IFC name, and classification or material
links, which need bSDD's search. The suggestions were not looked up one by
one this time, because bSDD's API was out of reach from the build machine.
Every link of the same form in the corpus that was looked up live earlier
the same day resolved. The full method and numbers are in
`ventures/ids-model-check/eval/bsdd-suggest-2026-11-19.md`.

The tool is free and MIT licensed, and your files stay in your browser. It
is not a substitute for the BIM manager who owns the requirements.
