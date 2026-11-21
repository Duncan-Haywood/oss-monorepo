# Wall parts that stayed unpaired, and the boxes open shells lost, 2026-11-21

**Question.** The change report on the Aalseth Residence
(`revision-diff-2026-11-20.md`) left one host wall and three of its Revit
parts unpaired in three of four steps, so a GlobalId-only reader would see a
wall removed and three walls added where nothing changed. Why, and is the
cause wider than one wall?

**Data.** The same files as before, none committed: the five Aalseth
Residence exports (OpeningDesign, CC BY-SA 4.0), the five Lake Kegonsa Home
exports (OpeningDesign, no licence file), HHS Office architect and
construction pairs (`opensourceBIM/IFC-files` at `cb96c50`), and ten public
models from `ThatOpen/engine_web-ifc` at `5ba2467`, `tests/ifcfiles/public/`.
Fetch commands: `revision-diff-2026-11-20.md` and `units-repair-2026-11-20.md`.

## What was wrong

The wall is `Basic Wall:INT - W4CØF ... :2146991` on the basement storey,
1.12 m long and 1.38 m high, 0.1861 m3. Its parts are 0.0245 + 0.1352 +
0.0222 = 0.1819 m3. Two things kept them apart:

1. **One part had no box.** `Part:2638106`, the 5/8" gypsum layer, is a
   faceted brep whose top corner is written twice, 0.0004 ft (0.12 mm) apart
   (`#502834` and `#502836`). Edge matching then finds two edges with one
   face each, so the shell is "not closed". That correctly refuses a section
   (an area cut through an open shell is not trustworthy), but the code
   also dropped the shell's loops, and the box is measured from those
   points. The volume was still read (0.0222 m3), so the part sat in the
   report with a volume and no place. The group test only looks at elements
   with a box, so it saw two parts summing to 0.1597 m3, 14% short.
2. **Even with the third part, 2.3% short.** Layers lose more at their
   trimmed ends than the host does. On a long wall that is 0.2 to 1.6%
   (the 2% tolerance was set there); on a 1.1 m wall it is 2.3%.

The first cause was not one wall. **26,620 of 27,668 elements in the 22
files had a box; 1,048 had none**, every one of them an open faceted shell
(32 to 155 per Aalseth export, 78 to 87 per early Kegonsa export, 133 in HHS
architect).

## What changed

- `geom.mjs`: an open faceted shell keeps its loops as `loose`, carried
  through placements and into multi-item bodies (one open item used to wipe
  every item's points). `solidPoints`, and so `solidExtent`, the box and the
  plan rectangle, read them; sections and surface areas still refuse an open
  shell.
- `diff.mjs`: a group whose boxes together make the element's box (every
  face within `moveTol`, 1 cm) may differ in volume by up to `tiledGroupTol`
  (5%) instead of 2%.
- `diff.mjs`: **the pieces of a group must be of one class**, each class
  tried by itself. Checking the new boxes turned up false groups the report
  had been printing: on Kegonsa, a wall "split" into a wall and the door in
  it (already in the 2026-11-20 report), a wall and a beam "merged" into one
  wall, and nine curtain-wall members, an interior wall and a stair stringer
  "merged" into a fireplace trim wall (both in the 2026-11-20 report); with
  boxes now on two windows, a wall "split" into a wall and its two windows.
  A wall's windows are inside its box and their volume can make up the
  difference by chance. Real pieces always share a class: wall parts are
  IfcWall, roof parts IfcRoof, a roof re-exported as slabs IfcSlab.
  IfcWallStandardCase counts as IfcWall.

## Results

**The change report** (`node eval/revision-diff.mjs <files>`, output in
`revision-diff-aalseth-2026-11-21.txt`/`.json` and
`revision-diff-kegonsa-2026-11-21.txt`/`.json`):

| Series, step | Before | Now |
|---|---|---|
| Aalseth 1 -> 2 | 3 added, 555 removed; 9 split | 0 added, 554 removed; 10 split (the basement wall into its 3 parts, 0.1861 -> 0.1819 m3) |
| Aalseth 2 -> 3 | 75 added, 5 removed; 9 merged | 74 added, 2 removed; 10 merged |
| Aalseth 3 -> 4 | 3 added, 2 removed; 8 split | 0 added, 1 removed; 9 split |
| Aalseth 4 -> 5 | 161 added, 17 removed | same; one more element reported moved (its box is now known) |
| Kegonsa 1 -> 2 | 156 / 68; 1 split (wall into wall + door) | 157 / 68; no group; one window matched by geometry |
| Kegonsa 3 -> 4 | 144 / 71; no group | 140 / 70; 1 split (soffit roof into its 4 slabs, 6.4659 -> 6.4852 m3) |
| Kegonsa 4 -> 5 | 469 / 252; 2 merged (wall + beam; 11 mixed pieces) | 470 / 263; 1 merged (two 6" foundation slabs replaced in place by one exterior deck slab, 2.6450 -> 2.6827 m3) |

Every unpaired Aalseth wall part is now paired. On Kegonsa more pairs are
reported moved (step 2 -> 3: 44 to 95, 42 of the new ones windows) because
both sides now have boxes. The moves read as real: windows and toilets on
one storey drop 19 mm together, as closed-shell elements on the same storey
already showed, and a door and the window beside it move 0.117 m together. The
deck slab group is the one judgment call: one class, same footprint, but a
different type name; it is listed with both names, and the bill-of-quantities
change is summed from the rows, not the pairs, so the foundation-to-deck
change still shows there.

**The HHS controls** keep their known answer with every element now boxed
(architect: 133 -> 0 without a box): architect -> architect2 one changed
(the renamed wall), construction -> construction2 none changed, one column
matched by Tag.

**What else moved** (`node eval/compare-builds.mjs <main's copy> <files>`,
output in `open-shell-boxes-2026-11-21.txt`): no volume and no area changed
on any element of the 22 files. The plan rectangle, which the envelope test
casts rays from and against, is now known for more walls, railings and
members (dental clinic 1,794 -> 1,805, Kegonsa 1 189 -> 220). Among walls
whose author set IsExternal, the envelope test agrees with the flag on
**4,459 of 5,522, was 4,420 of 5,497**: Kegonsa exports 1 to 3 gain 11, 13
and 10; dental clinic, schependomlaan and three Aalseth exports gain 1 to 3
each; HHS architect loses 2 (42 -> 40 of 112: two exterior walls now read as
interior behind newly placed elements). Uniformat codes changed on 52
elements: 26 railings (24 to C2010, standing on a stair now that they are
placed; 2 to C1010), 12 frame members and slabs to B1020 on Kegonsa (the
roof deck they carry is now known), the 2 HHS architect walls (B2010 to
C1010), and 12 walls on HouseZ (no flags to check against; 6 get
B2010 where they had no code, 6 move from B2010 to C1010).

**Seeded faults.** Dropping the loose loops from `solidPoints`, or from a
placement, fails the new engine test; trying all classes as one group, or
letting every group take 5%, fails a `diff.test.mjs` test.

**What this does not show.** Whether an estimator wants a foundation slab
replaced in place by a deck slab shown as one group or as a removal and an
addition. The 5% and 1 cm come from one wall; a model of many thin layers
could tile a box by chance (each pairing is listed in the CSV). The HHS
architect loss is not explained element by element.
