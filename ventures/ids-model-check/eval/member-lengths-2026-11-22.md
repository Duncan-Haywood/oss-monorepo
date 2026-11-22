# Columns', beams', members' and piles' Length from their bodies (2026-11-22)

**Question.** The model fill's `--from-geometry` (`geometry-quantities.mjs`)
measured volumes, areas and walls' Length and Height, but no Length for a
column, beam, member or pile. Its comment said why: "a beam's or member's Qto_
Length is a nominal figure its cut-backs make ambiguous, and no public model
here stores one to check against." The second half was wrong: the public
exports this venture already uses store 5,079 such lengths. What does a body
give, how close is it to what each tool stored, and where does it stay
ambiguous?

## What changed

- `memberLength(row, solidExtent, convention)`: two readings from the
  takeoff's body and its axis (`computed.areas.cross.n`: the extrusion
  direction, or a faceted body's prism axis): the body's **extent** along the
  axis, and its **volume over the mid-length section**, which for a prism cut
  by planes is the length of the line through the section's centroid.
  - *Square ends* (the two within 0.5%): the extent is offered.
  - *Cut ends*: only by the authoring tool's convention, read from the owner
    history (`toolConvention`, the walls' Height lookup made general):
    ARCHICAD `centroid`. Tekla, Revit and others: none.
  - A body whose extent along its axis is not more than its largest width
    across it (12 directions in the section plane) is not taken for a linear
    member: none.
- `addMemberLines` puts the offered length in `computed.lines.length`;
  `measureModel` (CLI `--fill --from-geometry`, the page checkbox, the worker)
  calls it after the walls. `Length` in `GEOMETRY_QUANTITIES` now covers
  `IFC(WALL|COLUMN|BEAM|MEMBER|PILE)`.
- Tests: `geometry-quantities.test.mjs` (square, cut with and without a
  convention, a plate held back; the fill writing the sample office's column
  and beam Length, 3000 and 4000 mm).

## Setup

The ten public exports with linear members and stored lengths:
`opensourceBIM/IFC-files` at `cb96c50` (HHS Office construction and architect,
Revit 2010; Schultz Residence, Revit, stores none) and
`ThatOpen/engine_web-ifc` at `5ba2467`, `tests/ifcfiles/public/` (AC20-FZK-Haus,
C20-Institute-Var-2 and schependomlaan, ARCHICAD; ISSUE_021_Mini Project,
ISSUE_102_M3D-CON-CD and ISSUE_102_M3D-CON, Tekla; ISSUE_068_ARK_NUS_skolebygg,
Revit 2019). Sparse clones as in `eval/model-attr-codes-2026-11-17.md` and
`../ifc-quantity-takeoff/eval/areas-vs-stored-2026-11-19.md`.

```
node --max-old-space-size=7000 eval/member-lengths.mjs MODEL.ifc ... --json eval/member-lengths-2026-11-22.json   # > member-lengths-2026-11-22.txt
node --max-old-space-size=7000 eval/member-lengths-fill.mjs MODEL.ifc ... --out DIR                               # > member-lengths-fill-2026-11-22.txt
python3 eval/member_lengths_ifctester.py DIR    # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; > member-lengths-ifctester-2026-11-22.txt
```

## 1. How the readings split, before choosing a rule

A first pass offering the extent everywhere, by end shape and tool:

| Ends | Tool | Stored | Extent within 2% | Volume / section within 2% |
| --- | --- | ---: | ---: | ---: |
| square | Revit (HHS; ARK_NUS in section 2) | 1,649 | 1,649 | 1,649 |
| square | ARCHICAD | 113 | 108 | (same figure) |
| square | Tekla | 2,254 | 2,198 | (same figure) |
| cut | ARCHICAD (schependomlaan) | 17 | 0 | 16 |
| cut | Tekla | 319 | 158 | 24 |

The 56 square-ended Tekla misses are all `PL…` plates exported as `IfcBeam`
(`PL6*60`: stored 0.132 m, the plate's own length, extruded 0.060 m). They are
bodies shorter along the axis than across it. But 221 other `PL…` plates of
the same shape store the extrusion: no rule by name or ratio separates them
(ratio bands 0.25-0.75: 223 extrusion, 56 width). So every body that is not
longer than it is wide is held back rather than guessed (808 Tekla beams in
Mini Project, most of which the extent would have got right).

Tekla's cut members: the extent is right for 156 of 172 that pass the width
test (Mini Project 52 of 55, M3D-CON-CD 100 of 104, M3D-CON 4 of 13). That is
91%, and 9 of the 13 on one file are off by about 3%, so Tekla is given no
convention: its cut members go to the to-fill table.

## 2. The rule, against every stored Length

`eval/member-lengths-2026-11-22.txt`:

| Model | Tool, class | Stored | Offered | Within 2% | Repeated stored figure | Other misses | Not linear | Cut, held back |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS construction | Revit IfcColumn | 257 | 257 | 257 | | | | |
| HHS architect | Revit IfcMember | 1,392 | 1,375 | 1,375 | | | 17 | |
| AC20-FZK-Haus | ARCHICAD IfcBeam | 1 | 1 | 1 | | | | |
| C20-Institute | ARCHICAD IfcColumn | 2 | 2 | 2 | | | | |
| schependomlaan | ARCHICAD IfcBeam | 127 | 123 | 118 | | 5 | 4 | |
| Mini Project | Tekla IfcBeam | 1,946 | 1,101 | 1,101 | | | 808 | 37 |
| Mini Project | Tekla IfcColumn | 26 | 8 | 8 | | | | 18 |
| Mini Project | Tekla IfcMember | 228 | 228 | 228 | | | | |
| M3D-CON-CD | Tekla IfcBeam | 242 | 18 | 18 | | | 120 | 104 |
| M3D-CON-CD | Tekla IfcColumn | 32 | 16 | 16 | | | 12 | 4 |
| M3D-CON-CD | Tekla IfcPile | 68 | 68 | 68 | | | | |
| M3D-CON | Tekla IfcBeam | 31 | 12 | 12 | | | 6 | 13 |
| ARK_NUS | Revit IfcBeam | 40 | 40 | 16 | 23 | 1 | | |
| ARK_NUS | Revit IfcMember | 687 | 660 | 7 | 653 | | 27 | |

- **3,909 offered; 3,227 within 2%.** 676 of the rest are ARK_NUS elements
  whose stored Length is one figure written on pieces of different length
  (653 curtain-wall mullions all store 20.858 m; *repeated* = the same stored
  value on two or more elements of one class whose bodies differ by more than
  2%). Leaving those out, **3,227 of 3,233 (99.8%)**.
- The 6 other misses: four ARCHICAD strip footings (`fund_strook`, stored
  0.281 m, body 0.5 m along its extrusion, square), one cut ARCHICAD beam
  (#8123, stored 0.35 m, volume over section 0.655 m), and one Revit 2019 beam
  (#1165849, stored 1.92 m, body 2.08 m). Not explained.
- 994 held back as not linear, 176 as cut ends with no convention. They stay
  in the to-fill table for a person.

## 3. End to end: the fill with the stored lengths hidden

Every `IFCQUANTITYLENGTH('Length'` renamed in five of the models, the fill
asked for `Qto_<Class>BaseQuantities.Length` on every column, beam, member and
pile (`eval/member-lengths/member-lengths.ids.xml`) with geometry on
(`eval/member-lengths-fill-2026-11-22.txt`):

| Model | Written from geometry | With a stored Length | Within 2% | Left to the table |
| --- | ---: | ---: | ---: | ---: |
| HHS construction | 257 | 257 | 257 | 0 |
| HHS architect | 1,375 | 1,375 | 1,375 | 75 |
| Mini Project | 1,340 | 1,337 | 1,337 | 863 |
| M3D-CON-CD | 102 | 102 | 102 | 240 |
| schependomlaan | 188 | 123 | 118 | 18 |

- **3,262 written; 3,189 of the 3,194 with a stored figure within 2%** (the
  five misses are section 2's ARCHICAD ones). The fill's own re-read passes
  3,262 of 3,262.
- **IfcTester agrees**: on the hidden copies 0 elements pass any of the
  specifications; on the filled ones 3,262 pass, the same count as written
  (`eval/member-lengths-ifctester-2026-11-22.txt`).
- IfcTester 0.9.0 crashes on these IFC2X3 files (`entity_instance` has no
  `declaration`, read on a quantity with its own unit); the script gives
  `entity_instance` the accessor it expects. Upstream bug, not ours.

## What this does not show

- Revit cut members: no public model here has one with a stored Length, so
  Revit has no convention and gets none.
- Tekla's figure for cut members: neither reading fits often enough; its
  `Length` may be the part's reference-line length, which the IFC body does not
  carry. A Tekla export with its reference lines (or a user's table) is what
  would settle it.
- Curved members (a bent glulam): the extent along one axis is no length.
  `computed.areas.cross.n` comes from a straight extrusion or prism axis, so a
  swept-disk or curved sweep body gets no cross axis and no length.
