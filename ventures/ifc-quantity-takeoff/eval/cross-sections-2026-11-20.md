# Stored cross-sections: half a surface, and footings cut the wrong way, 2026-11-20

Follows [joins-and-host-figures-2026-11-20.md](joins-and-host-figures-2026-11-20.md),
which left 192 of 12,167 stored areas on the eight public models unexplained,
77 of them `CrossSectionArea` on columns, beams and members: HHS architect's
58 Revit mullions, schependomlaan's 17 foundation beams and C20's two
columns. 75 of the 77 now have a cause, and 13 of them turn out to be our
cut, not the file.

**Data.** The same eight models at the same commits (`opensourceBIM/IFC-files`
`cb96c50`, `HHS Office/`; `ThatOpen/engine_web-ifc` `5ba2467`,
`tests/ifcfiles/public/`), blob-less sparse clones.
`node eval/areas-vs-stored.mjs <8 files> --json eval/areas-vs-stored-2026-11-20-sections.json`
(output in `areas-vs-stored-2026-11-20-sections.txt`).

## 1. HHS's mullions store half their surface

Mullion #17161 (`Rechteckiger Pfosten:6 x 15 mit Deckprofil`, a 6 x 15 cm
post with a cover strip) has a 0.0095 m2 section, and its `BaseQuantities`
say CrossSectionArea 660,720.18 mm2 (0.66 m2). It stores no Length quantity
(Revit's Length, 2,037.5 mm, sits in `PSet_Revit_Dimensions`), so the
host-figure rule could not take it, and the 58 store nine different values
that grow with the piece (0.49 to 1.04 m2), so they are not one copied figure
either.

The body is a 18-face `IfcFaceBasedSurfaceModel`. The sum of its face areas
is 1,321,440.357 mm2, and half of that is 660,720.179 mm2: the stored figure
to nine significant digits. The same holds for all 58: stored
CrossSectionArea = (total area of the body's faces) / 2, within 0.5%.

Rule (`half-surface`): the stored CrossSectionArea of a column, beam, member
or pile equals half the body's surface within 0.5%. The figure is marked not
to be trusted (it is not a section), so the bill of quantities uses the
computed section. `surfaceArea` (`geom.mjs`) sums face loops plane by plane as
area vectors, so an inner bound comes off its face; it returns null for a
body of more than one convex piece (their shared inner faces are not
surface), which leaves 1,176 of architect's 1,392 agreeing members without a
surface figure. Of the 2,093 other cross-section pairs that have one, **none**
matches half its surface, agreeing or not; the rule names the 58 and nothing
else.

Checked on `HHS Office/architect2.ifc` too: the same 58 match and nothing
else does. That file is a later revision of the same model with the same
mullions, so it confirms the reading, not that other Revit exports do this.

## 2. schependomlaan's footings: the cut was wrong

The 17 foundation beams (`fund_strook` 500 x 250 strip footings and
`fund_opstort` 150 x 315 / 350 x 660 upstands) store their nominal profile:
CrossSectionArea 0.125 = 0.5 x 0.25 m, 0.04725 = 0.15 x 0.315 m. Our
computed figure was 7% over on 12 (0.13392 against 0.125) and far under on
5. These are faceted breps: a strip footing #3776 is a six-face trapezoid in
plan, 1.398 m on one side and 1.014 m on the other, both ends mitred.

A faceted member has no extrusion to read its axis from, so the engine cut it
normal to the end face along which it is longest. A mitred end face is
slanted: the cut was a slant cut through the profile, 1/cos 21 deg = 1.071 times
too large. The geometry knew better. A prism's side faces all lie along its
axis, so `prismAxis` (`geom.mjs`) now takes the direction perpendicular to
the most face area. For a box that is its longest edge, as before; a
trapezoid in plan is also a prism standing up (its two ends and two sides are
all vertical), and the run wins because its sides (1.81 m2, which is the
file's own NetSurfaceAreaExtrudedSides) outweigh the standing-up reading's
(0.87 m2). Within 1% of each other it gives no answer, and the old choice
stands.

13 of the 17 now agree (12 strip footings and the one upstand that the
scales-with-length rule had misnamed). The other 5 are stubs about as short
as they are wide (0.28 to 0.35 m long on 0.35 to 0.5 m profiles), where the
crosswise faces carry more area than the sides and no face rule can tell
which way the piece runs. Each stores its own Width x Height as the section,
exactly: rule `own-profile`, figure trusted.

## Result

| | before | after |
|---|---:|---:|
| CrossSectionArea pairs | 2,752 | 2,752 |
| agree | 2,005 | **2,018** |
| unexplained | 77 | **2** |
| All stored areas unexplained | 192 | **117** |

No other pair moved: every other line of
`areas-vs-stored-2026-11-20-sections.txt` matches
`areas-vs-stored-2026-11-20-joins.txt` except run times, and the 5 left
unexplained-then-own-profile are a subset of the 17.

## What this does not show

- One Revit export (two revisions of it) for `half-surface`. Why the
  exporter writes half the surface is not known; a thin plate's half surface
  is about its face area, so it may be an exporter treating every
  surface-model member as a sheet.
- `prismAxis` was checked on the 2,752 cross-section pairs of these eight
  models (no agreeing pair lost). It reads faces, so a faceted member with
  many small faces (more than 48) still falls back to its longest direction.
- C20's two columns (storing about twice their perimeter) stay unexplained.
