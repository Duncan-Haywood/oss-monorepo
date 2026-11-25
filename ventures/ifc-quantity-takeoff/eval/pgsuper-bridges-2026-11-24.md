# A second IFC4X3 bridge: three BridgeLink PGSuper exports, 2026-11-24

**Question.** Viadotto Acerno was the only IFC4X3 bridge the alignment reader
had been checked on (eval/linear-placement-2026-11-22.md). Does it read a
bridge from a second exporter, and are the figures right?

**Data.** Three bridges exported by WSDOT's BridgeLink PGSuper 8 (IFC4X3_ADD2,
written through IfcOpenShell 0.8), in RickBrice/IfcAlignmentDriver, the PGSuper
author's alignment test bed: `I405-SR167.Flyover.ifc` (a 24-girder flyover
over 198 m of alignment, a 324 m right-hand curve onto a tangent, a crest
parabola, Jacobs, 2024-03-22), `IFC_Alignment4_Br1.ifc` (a 5-girder span on a
2 km alignment with clothoids and three parabolas) and `PGSuperExport.ifc`
(a straight, level 5-girder span). That repository has no licence, so the
files are fetched, not copied here: `bash eval/pgsuper-bridges-fetch.sh DIR`
(sha256 sums in the raw output). Raw output for everything below:
[pgsuper-bridges-2026-11-24.txt](pgsuper-bridges-2026-11-24.txt).

## Before

On main, the girders of all three read (they are lofted along their own 3D
polylines), but on the flyover and Br1 the deck and both railings were "not
read: alignment segment IFCPOLYNOMIALCURVE": PGSuper writes each parabolic
vertical curve as an `IfcPolynomialCurve`, which the reader did not draw. A
flyover BoQ with no deck.

## What was found and built (alignment.mjs, geom.mjs, qto.mjs)

1. **`IfcPolynomialCurve`** in the plane as a parent curve: x(u), y(u) from
   the coefficient lists, the segment's length measure taken as arc length
   and turned into u by Newton on the arc length integral (a parabola's point
   at its closed-form arc length to 1e-9 m in the tests).

2. **PGSuper's vertical is not written the way the IFC text or Viadotto
   reads.** Three differences, each settled per segment by which reading
   puts its end on the next segment's Placement (`readVertical`):
   - *Lengths are horizontal runs.* The 260.4303 m line at +2.993% starts
     the next segment exactly 260.4303 m further on; read as a curve length
     it stops 0.117 m short. Viadotto's lines are curve lengths (134.0706 m
     of line covers 134.0593 m), so this is read from the placements, not
     assumed.
   - *Parabolas carry their start grade in the polynomial, on a level
     RefDirection* (y = 0.05 u - 0.000244 u^2 placed with direction (1, 0)).
     The usual reading turns a parent so its start tangent lies along
     RefDirection, which tilts each parabola by its start grade: the
     flyover's crest then ends 5.9 m from the next segment and Br1's profile
     jumps 9 m at 600 m. **IfcOpenShell 0.9 reads it that way too** (its
     gradient-curve evaluator on Br1 agrees with our tilted reading to a few
     centimetres, jumps and all). Read level, every parabola ends on the
     next placement to 1e-9 m.
   - *Line grades are written as sines.* RefDirection is
     (sqrt(1 - g^2), g) and the rise is g times the run (7.79468 m =
     260.4303 m x 0.02993; 13.716 m = 274.32 m x 0.05). Read as a direction,
     the slope is g / sqrt(1 - g^2) and the line ends L g^3 / 2 high (3.4 mm
     on the flyover, 17 mm on Br1). Tried as one more reading, after the
     run reading misses.
   - PGSuper also places its zero-length closing segment at the last
     segment's start rather than its end; such a segment settles nothing, and
     the last real segment takes the reading its parent type showed earlier
     in the curve. The joint checker names it and leaves it out.

3. **Decks and railings drawn in absolute elevation.** PGSuper 8.0.3's deck
   and railing cross-sections have y from 20 to 29 m: the elevation, not an
   offset from the profile grade line, and the gradient curve adds the
   elevation again. Read as written (by IfcOpenShell 0.9 too: Br1's railings
   at z 48.0 to 51.6 m over girders at 22.1 to 25.0 m), the deck floats 25 m
   over its girders, and on the flyover's crest the 27 m lever arm inflates
   the loft's volume by 0.63% (Pappus in the vertical). When every section's
   middle is within 3 m of the curve's elevation at its station and that is
   over 6 m, each section is moved down by it, with a note on the element.
   PGSuperExport (8.0.0.5, alignment at elevation 0) and Viadotto are not
   touched.

4. **A section whose points meet.** Br1's deck at station 616.015, where the
   girder haunches run to zero depth, has four pairs of points 1e-12 to
   3e-9 m apart; the repeated-point filter dropped some of them and the
   sections no longer paired ("cross-sections with different point counts";
   IfcOpenShell 0.9 fails this deck too). Sections that differ only that way
   are now paired on their points as written.

5. **A lofted deck's plan area** is now its top seen from above (each up-facing
   face's area projected on the plan; `shellPlanArea`). The old plan cut at
   mid-depth caught 179 m2 of the flyover's deck; it is 3,399 m2 (802 m3 /
   3,399 m2 = 0.236 m mean depth with the haunches). On the straight
   PGSuperExport deck both give 347.2251 m2 (to 1e-7).

## Results

| | flyover | Br1 | PGSuperExport |
|---|---|---|---|
| elements read, main | 24 of 27 | 5 of 8 | 8 of 8 |
| elements read, now | **27 of 27** | **8 of 8** | 8 of 8 |
| vertical joints, worst gap | 1.8e-11 m | 1.6e-10 m | 0 |
| elevation vs the file's IfcAlignmentVerticalSegment rows, every metre | 1.8e-11 m | 2.8e-11 m | 0 |
| deck volume here / independent integral (m3) | 797.123 / 797.146 | 79.046 / 79.046 | 76.217 / 76.217 |
| railing volumes, worst relative difference | 1.4e-4 | 8e-6 | 0 |
| deck underside over girder tops | 0.12 to 0.20 m (12 girders) | 0.070 m (5) | (straight deck: see below) |

- **Elevation check** (`node eval/vertical-semantic.mjs`): the semantic
  vertical alignment (StartHeight, gradients, length; textbook parabola and
  circle formulas) against the geometric gradient curve as read, every metre.
  Viadotto, the control: 5.3e-6 m on its first alignment, as before; the
  second alignment's 3.5 cm is the file's own joint gap, also as before.
- **Independent integral** (`python3 eval/loft-integral.py`): Simpson on the
  cross-sections' areas, times sqrt(1 + g^2) from the semantic grades, times
  (1 - y k) for plan curvature from the semantic horizontal (Pappus). It does
  not use alignment.mjs. The flyover's railings, 8.8 m either side of a 324 m
  curve, show the Pappus split both ways: 80.747 / 78.320 m3 here against
  80.737 / 78.315 m3.
- **Deck on girders** (`node eval/deck-seat.mjs`): the deck's lowest point
  over each girder at the girder's mid-length station. A haunch of 7 to 20
  cm is what a seated deck looks like; before point 3 it was about 25 m. The
  flyover's 12 girders under its straight spans give no figure (the deck is
  sliced every 3 m there, too sparse for the probe); PGSuperExport's
  straight deck likewise, where IfcOpenShell's boxes (deck z -0.353 to 0,
  girder tops -0.283 to -0.356 m) show it seated.
- **Against IfcOpenShell 0.9.0** (`eval/pgsuper-bridges-ifcopenshell.py`, each
  element in its own process): it **crashes** (segmentation fault) on the
  flyover's deck and both railings, and on the flyover's gradient curve
  itself; it fails Br1's deck. World boxes agree to 0.00 mm on all 34
  girders and PGSuperExport's 3 deck parts; Br1's railings are 25.23 m off,
  IfcOpenShell's floating at the doubled elevation (point 3). Its volumes cannot be compared:
  the meshes for these lofts are open (15 to 97 edges each not shared by two triangles), so the
  signed volume depends on the reference point (172,857 m3 for one girder
  about the world origin, 400 km away; 0.67 times ours about the box centre,
  on every element alike). Ours equal the profiles' own area times length
  (a girder: 0.5642 m2 x 39.0144 m = 22.0124 m3).
- **Controls.** Viadotto Acerno: every volume unchanged and neither new rule
  fires; the only BoQ change is its 19 decks' plan area, 5,638 to 5,962 m2.
  Spans of the same 314.2 m2 footprint read 275.6 to 312.6 m2 by the old
  mid-depth cut (wherever the plane crossed the haunch) and all 314.19 to
  314.21 m2 now. buildingSMART's 46 IFC4.3 sample models: output identical to
  main's (140 of 141 read).

## Left

- An outside report, the owner's call: PGSuper 8.0.3's sections in absolute
  elevation and its level RefDirection on parabolas (to WSDOT's BridgeLink),
  and IfcOpenShell 0.9 crashing on the flyover's gradient curve.
- The deck-seat probe needs denser deck slices on straight runs (slice at
  each girder's stations, or ray-cast the mesh).
- A third exporter's IFC4X3 bridge: the bSI Infra Room's IFC-Bridge and
  IFC-Rail unit tests, Krande/adapy's `sectioned-solid-horizontal.ifc`, the
  RickBrice/IFC-Alignment-Geometry-Implementation-Guide examples (offset
  curves by distances, superelevated sections), found by code search
  2026-11-24.
