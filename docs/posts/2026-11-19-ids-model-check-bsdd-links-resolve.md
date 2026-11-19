---
title: "617 bSDD links written offline, all looked up live: one IFC name bSDD lacks"
seo_title: "Do offline bSDD links for IDS files resolve?"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS Model Check writes bSDD links for standard IFC properties without a lookup. Checked live, 617 of 617 resolve once one name, Reference, is skipped."
---

Earlier today IDS Model Check learned to write bSDD links for you. An IDS
property facet asking for `Pset_WallCommon.FireRating` can carry
`uri=".../uri/buildingsmart/ifc/4.3/prop/FireRating"`, the buildingSMART
Data Dictionary entry that defines it, and for a standard IFC property the
link follows from the name. So `cli.mjs --link-bsdd` and the page's
"Download IDS with bSDD links" button add it with no lookup at all.

That rule rested on a claim we could not test when it shipped: bSDD's API
did not answer from the machine that built it. The links people had
already written in that form all resolved, but the 619 new ones had never
been looked up. This afternoon bSDD answered, so we looked them up.

## The corpus, link by link

`eval/bsdd-suggest-live.mjs` takes the 54 public IDS files that get
suggestions, writes the links in, and runs the same bSDD check a user gets
from `--audit --bsdd`. 593 links came back clean. Two did not resolve at
all, and both were the same property: `Pset_PlateCommon.Reference`, in two
copies of a buildingSMART test file.

`Reference` is in the IFC 4.3 templates for `Pset_PlateCommon`, and for 107
other `...Common` sets besides. bSDD's IFC 4.3 dictionary has no
`prop/Reference`, and its own copy of `Pset_PlateCommon` lists six
properties, not seven. A link to it would send a modeller to a 404, and the
bSDD check would then report an error the tool itself had written.

The other 24 findings were warnings and errors about the facets' own data
types: `NumberOfStoreys` asked as `IFCINTEGER` where IFC gives
`IFCCOUNTMEASURE`, `IsExternal` asked as `IFCLABEL` where IFC gives a
Boolean (two copies of the Dutch RVB BIM norm). The suggester already names
the template's type next to those links, and bSDD agrees on 24 of its 27.
The 3 it does not flag are quantities asked as `IFCREAL`; bSDD stores them
as plain Reals with no IFC type, so it has nothing to compare.

## Every template name, not just the corpus

One bad name in a corpus of 87 distinct links says little about the other
2,400 names the rule could write. So `eval/bsdd-template-sweep.mjs` asks
bSDD for all 760 IFC 4.3 template sets and compares them pair by pair with
the templates the tool ships. Of 3,988 set-property pairs, 3,683 sit in
bSDD's copy of their set at exactly the link the rule writes, and none at a
different one. All 108 pairs missing from a set bSDD has are `Reference`.
35 sets (197 pairs), mostly infrastructure and railway ones, are not in
bSDD as sets at all; for those the sweep asks each property link directly.

So the fix is one name. The suggester now skips `Reference` (a list
called `BSDD_UNLINKED`), and the sweep fails whenever that list stops
matching what bSDD says, so a future dictionary release that adds it, or
drops something else, shows up as a failing eval rather than a broken link
in someone's file. Rerun on the corpus: 617 links, all resolve.

bSDD rate-limits bursts. The sweep goes three requests at a time and asks
again for anything that came back 429; one run takes about twenty minutes.

Try it at [marisstella.app](https://marisstella.app/ids-model-check/): audit
an IDS and the bSDD box lists the links it would add. The numbers are in
`ventures/ids-model-check/eval/bsdd-suggest-live-2026-11-19.md`.
