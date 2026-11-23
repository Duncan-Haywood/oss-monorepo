# Material changes in the change report: renamed in place, or swapped, 2026-11-23

**Question.** NEXT.md: "material renames (IfcMaterial has no GlobalId;
Tulpstraat 3 -> 4 lists "Unknown" -> "brick" on 17 walls)". With no GlobalId
to hold on to, can the change report tell a material renamed in place from an
element given another material, without claiming renames on a re-export? And
can 17 identical material lines become one?

## Data

The same two series as the earlier change-report runs, fetched the same way
and not committed (licences: Tulpstraat has none, Aalseth is CC BY-SA 4.0):

- **Tulpstraat** (`github.com/C-Claus/Tulpstraat`, BlenderBIM, 12 commits of
  `Tulpstraat.ifc`): fetch steps in `revision-diff-tulpstraat-2026-11-23.md`.
- **Aalseth Residence** (`github.com/OpeningDesign/Aalseth_Residence`, five
  Revit 2019 exports): fetch steps in `revision-diff-2026-11-20.md`.

Rerun: `node eval/revision-diff.mjs <files in order>`. Output:
`revision-diff-materials-tulpstraat-2026-11-23.txt` (and `.json`),
`revision-diff-materials-aalseth-2026-11-23.txt`.

## What the file says about Tulpstraat 3 -> 4

The earlier write-up read this step as "material #67 renamed and a layer set
'brick' assigned". The two files show that nothing was assigned:

```
03: #67=IFCMATERIAL('Unknown',$,$);
    #68=IFCMATERIALLAYERSET((#70),$,$);
04: #67=IFCMATERIAL('baksteen',$,$);
    #68=IFCMATERIALLAYERSET((#70),'brick',$);
```

The 16 walls used layer set #68 (through their usages #76, #114, ...) in both
revisions. The set had no name, so its name was read from its one material,
"Unknown"; in revision 4 the material was renamed "baksteen" and the set was
named "brick". The slab used #67 directly. So all 17 "material changes" are two
renames in place, and no element was given another material.

## The rule

The takeoff now keeps, on each row, the entity the material association
names (`materialRef`), the set it reaches through a usage (`materialSet`:
id, kind, name) and the IfcMaterial entities under it (`materialParts`).

- **Are STEP ids meaningful between the two files?** Only when the file was
  edited in place. The test reads the elements, not the materials: of the
  pairs matched by GlobalId, at least 3, and at least 80% keep their own
  STEP id (`materialIdsKept`). Measured:

  | Series | Steps | Matched by GlobalId keeping their STEP id |
  |---|---|---|
  | Tulpstraat (BlenderBIM) | 11 | 100% on every step (26 to 60 elements) |
  | Aalseth (Revit re-exports) | 4 | 0%, 1.2%, 2.1%, 0.1% |

  A first try that compared the material names under shared ids needed at
  least 3 shared materials, and Tulpstraat's step 3 -> 4 has one; the
  element test has no such gap.
- **Renamed:** when ids are kept, an IfcMaterial or a layer, profile or
  constituent set whose name differs under one id, the same kind of entity
  on both sides, is listed in `renames.material` with the number of later
  elements using it.
- **Marked, still a change:** an element whose material string changed while
  its association names the same entity and reaches the same IfcMaterials in
  the same order gets `sameMaterialEntity` on its material attribute. A
  material name is the specification, as a type name is, so it is not
  counted unchanged. A wall moved from a bare material to a layer set of that
  same material is a re-specification and is not marked.
- **Swaps:** every material change, marked or not, is grouped by
  before -> after with the count, classes, volume and area of the elements
  (`materialSwaps`): one line for an estimator to price per re-specification.
  It shows in the changes CSV ("material swap", "material renamed" rows), on
  the page's change list and in two new summary cards.

## Result

| Series, step | Material changes (elements) | Before | After |
|---|---|---|---|
| Tulpstraat 3 -> 4 | 17 | 17 lines | 2 renames (#67 Unknown -> baksteen, 17 elements; layer set #68 (none) -> brick, 16), 2 swap lines, 17 of 17 marked same entity |
| Tulpstraat 4 -> 5 | 15 | 15 lines | 3 swap lines (brick -> binnenwand_materiaal 9, -> baksteen 4, -> none 2), 0 marked: new sets, not renames |
| Tulpstraat 10 -> 11 | 1 | 1 line | 1 swap line, 0 marked |
| Aalseth 4 -> 5 (Revit) | 30 | 30 lines | 14 swap lines, ids not kept, 0 renames claimed |
| Every other step of both | 0 | | no rename, no swap |

Everything else the report says is unchanged: the text output of both series
before and after the change is identical apart from the new lines (checked by
running the old code from `git stash` on the same files the same day).

**Tests** (`diff.test.mjs`): a Tulpstraat-shaped case (a material and a set
renamed, one wall re-specified, one slab on the bare material), the same rows
renumbered as a re-export (no rename, nothing marked, the 3 swaps kept), and
`samples/sample-office.ifc` with `#70` renamed in the text, read through the
takeoff (every concrete element changed only by the marked material).

## What this does and does not show

It shows the rule on one in-place series and one re-export series. It does
not show it on an ArchiCAD or Vectorworks series (none public yet, NEXT.md),
or on a tool that edits in place but renumbers on save; the 80% element test
would then say "not kept" and the report falls back to swaps only, which is
the safe side. Whether a rename like "Unknown" -> "baksteen" changes a price
is the estimator's call; the report only says it is the same entity.
