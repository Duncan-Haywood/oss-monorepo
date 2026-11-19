# Offline bSDD links, looked up in bSDD (2026-11-19)

`bsdd-suggest.mjs` (`cli.mjs --link-bsdd`, the page's "Download IDS with bSDD
links") writes `<IFC 4.3 dictionary>/prop/<baseName>` onto requirement
property facets on a standard `Pset_`/`Qto_` property, with no lookup
(`eval/bsdd-suggest-2026-11-19.md`). When it shipped, bSDD's API did not
answer from the container, so its 619 corpus links were never resolved one by
one. This afternoon `api.bsdd.buildingsmart.org` answered (Node's fetch and
curl, through the proxy), so they were.

## 1. The corpus links, through the user's own check

`node eval/bsdd-suggest-live.mjs`: for each of the 54 distinct public IDS
files that get suggestions (`eval/corpus/real` and `eval/corpus/bsdd`, as in
bsdd-suggest-corpus.mjs), add the links, run `checkBsdd` with the schemas and
unit table exactly as `cli.mjs --audit OUT.ids --bsdd` does, and keep only the
findings on inserted links (same line and uri). About 95 bSDD requests, 14 s.

First run, before any change: 619 links (88 distinct); 593 with no error or
warning. 2 `bsdd-not-found` errors, both `Pset_PlateCommon.Reference` (two
copies of buildingSMART's `wooden-windows.ids` test file, in Xbim.Xids and
IDS_Validator_ARX). `Reference` is a property of `Pset_PlateCommon` in the
IFC 4.3 templates the tool ships (`schema/psets-ifc4x3.json`), but bSDD has
no `ifc/4.3/prop/Reference`, and bSDD's own `Pset_PlateCommon` class lists
six properties (AcousticRating, FireRating, IsExternal, LoadBearing, Status,
ThermalTransmittance), not seven.

The other 24 findings are all `bsdd-datatype` (5 errors, 19 warnings) on
facets that ask another type than the template's: NumberOfStoreys,
NumberOfGangs and NumberOfSockets as IFCINTEGER (IFC: IFCCOUNTMEASURE),
SerialNumber/BarCode as IFCTEXT and BuildingID as IFCLABEL (IFCIDENTIFIER),
MarketCategory/MarketSubCategory as IFCREAL or IFCLENGTHMEASURE (IFCLABEL,
error), IsExternal as IFCLABEL in both RVB BIM Norm v1.1 copies (IFCBOOLEAN,
error). The suggester already names the template's type for 27 links; bSDD
gives the same finding on 24. The 3 it does not are Qto_SpaceBaseQuantities
quantities asked as IFCREAL: bSDD stores GrossFloorArea, GrossVolume and
Height as plain `Real` with no IFC type in their entries, so there is nothing
to differ from. These are the files' own slips, correctly linked, and stay as
they are (the link is right; the dataType is what the user should fix).

After the fix below: **617 links, all 617 resolve**; 593 clean, the same 24
dataType findings, no `bsdd-not-found` (`eval/bsdd-suggest-live.txt`).

## 2. Every template name: `eval/bsdd-template-sweep.mjs`

One bad name in 88 says little about the other names the rule could write,
so the sweep asks bSDD for all 760 IFC 4.3 template sets
(`/api/Class/v1?...&IncludeClassProperties=true`) and compares pair by pair.
For names it does not find in a bSDD set it asks the property link itself.
bSDD answers bursts with 429 even after `getJson`'s five retries, so the
sweep goes 3 at a time and asks again, in up to five later rounds 30 s apart,
for whatever still failed (a first version at 8 at a time lost 43 sets). One
full run took about 25 minutes; a second hung at over an hour under throttling
and was stopped, so the 35-set part was rerun on its own with `--sets`.

| | pairs |
| --- | --- |
| set-property pairs in the templates | 3,988 |
| listed in bSDD's copy of the set, at the rule's link | 3,683 |
| listed at a different link | 0 |
| not in bSDD's copy of the set | 108, all `Reference`; prop/Reference does not resolve |
| in a set bSDD does not carry (35 sets) | 197 |
| of those, the property link resolves anyway | 116 |
| of those, it does not | 81 (77 names; 4 are `Reference`) |

Full output: `eval/bsdd-template-sweep.txt` (the 760-set run) and
`eval/bsdd-template-sweep-missing-sets.txt` (`--sets` with the 35).

The 35 sets bSDD lacks are mostly the newer infrastructure, profile and
resource sets: `Pset_ProfileArbitraryDoubleT`, `Pset_ProfileArbitraryHollowCore`,
`Pset_ProfileMechanical`, `Pset_AlignmentCantSegmentCommon`,
`Pset_AlignmentVerticalSegmentCommon`, `Pset_ConstructionResource`,
`Pset_DistributionBoardOccurrence`, the railway communication appliance sets,
`Qto_LaborResourceBaseQuantities` and others. Where their property names are
also used by sets bSDD does carry, the link resolves; the 76 names unique to
them (MomentOfInertiaY, ShearCentreZ, CantDeficiency, ActualCost, ...) do not.

## The change

`bsdd-suggest.mjs` exports `BSDD_UNLINKED`, the 77 names whose rule link does
not resolve, and suggests no link for them. A facet on one of them is left
as it was: no link beats a link that the tool's own bSDD check then reports
as an error. The sweep compares its result with `BSDD_UNLINKED` and exits 1
when they differ, so a bSDD release that adds or drops a property shows up
as a failing eval, not as broken links in people's files.
`bsdd-suggest.test.mjs` checks that `Pset_PlateCommon.Reference` gets
nothing while the set's FireRating still does, and that every listed name is
a template property.

Skipping by name is exact here: a name that bSDD lists in any set resolves
(the 3,683 pairs), so none of the 77 can be one a bSDD set holds.

On the corpus, 619 suggestions become 617 (the two `Reference` facets);
`eval/bsdd-suggest-corpus.txt` is otherwise unchanged (196 of 198 author
links matched, 54 of 54 round trips). `node --test` in the venture: 361 pass.

## Limits

- bSDD's dictionary is a moving target; the list is right as of 2026-11-19.
  Rerun the sweep (`--sets` for a part) after a templates or dictionary change.
- The live check covers the 54 corpus files. Names outside the corpus are
  covered by the sweep's existence check, not by a full `checkBsdd` (which
  also compares data types and allowed values).
