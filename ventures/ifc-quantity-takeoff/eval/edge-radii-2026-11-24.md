# Toe radii on steel sections: the notched angles' 1% was the section, not the cut, 2026-11-24

**Question.** [coped-coating-2026-11-24.md](coped-coating-2026-11-24.md) left
Mini Project's two notched `KOKER` angles (#10087, #10618: an L200/100/10 less
a rectangular notch) reading about 1% high: volume 0.007526 m3 against
IfcOpenShell 0.00747 and a Monte Carlo count of 0.007446 ± 0.000029, area
1.52138 m2 against IfcOpenShell 1.50562. The note's suspect was the cut of the
fillet's signed pieces by the notch. Was it?

**Data.** `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/ISSUE_021_Mini
Project.ifc` (Tekla, IFC2X3; a blob-less sparse clone, not committed).

## The body, worked by hand

#10087's body is `IFCBOOLEANRESULT(.DIFFERENCE.)` of

- `IFCLSHAPEPROFILEDEF(.AREA.,'L200/100/10',#114,200.,100.,10.,15.,7.5,...)`
  extruded 2,630 mm: depth 200, width 100, thickness 10, root radius 15,
  **edge radius 7.5**;
- a 100 x 150 rectangle extruded 515 mm from x = 2,689.15 back along the
  member. In the angle's section frame it covers the full 100 mm width and
  heights 50 to 200 mm, so it takes the top 50 mm of the long leg (its toe
  included) over the last 2,630 - 2,174.15 = 455.85 mm.

With q = 1 - pi/4 (the area a 90-degree corner of radius r gains or loses is
r^2 q):

| | mm2 or mm3 |
|---|---:|
| section, legs | 200 x 10 + 90 x 10 = 2,900 |
| root fillet, r 15 | + 225 q = + 48.29 |
| two toes, r 7.5 | - 2 x 56.25 q = - 24.14 |
| **section** | **2,924.15** (EN 10056-1 lists 29.2 cm2) |
| notch: 50 x 10 less the long leg's toe | (500 - 12.07) x 455.85 = 222,424 |
| **volume** | 2,924.15 x 2,630 - 222,424 = **7,468,076 mm3 = 0.0074681 m3** |

The takeoff's section was 2,948.29 mm2: legs plus root, **no toes**. That is
exactly 24.14 mm2 high, and 24.14 x 2,630 - 12.07 x 455.85 = 57,996 mm3 is
the whole of the 0.000058 m3 excess. The cut was right.

## The fault and the fix

`Geometry.profile` (geom.mjs) read each parametric section's root radius
(FilletRadius) and ignored its toe radii:

| profile | radius left out before | where it rounds |
|---|---|---|
| IfcLShapeProfileDef | EdgeRadius | each leg's toe, inner corner |
| IfcIShapeProfileDef | FlangeEdgeRadius (IFC4) | each flange tip's inner corner (4) |
| IfcUShapeProfileDef | EdgeRadius | each flange toe's inner corner (2) |
| IfcTShapeProfileDef | FlangeEdgeRadius, WebEdgeRadius | flange tips' inner corners; both corners of the web's foot |
| IfcZShapeProfileDef | FilletRadius **and** EdgeRadius | the two roots; each flange toe's inner corner |

A new `filletEach(pts, radii)` rounds each corner by its own radius
(`filletAll` now calls it), and each case passes its root and toe radii. The
toe placements follow the IFC figures for each profile. `sectionVariants` also
offers "no edge radii" (root kept, toes square) beside "no fillets", so a
stored figure computed that way can be named; none in the public models is.
IfcCShapeProfileDef's InternalFilletRadius is still not drawn: whether the
outer corners take r + t is not settled by the text, and no public model
here has a C section with one.

## Result

Mini Project, before and after, element by element: 17 of 2,636 elements
change, all of them angles (the only profiles in the 30 public models of the
folder with a non-zero toe radius; the 3 I sections there and ARK_NUS's 1
carry none). Nothing else moves.

| part | section mm2, was -> now | EN 10056-1 | volume m3, was -> now | coating m2, was -> now |
|---|---:|---:|---:|---:|
| #10087 L200/100/10, notched | 2,948.29 -> 2,924.15 | 29.2 cm2 | 0.007526 -> **0.007468** | 1.52138 -> **1.50586** |
| #10618 L200/100/10, notched | 2,948.29 -> 2,924.15 | 29.2 cm2 | 0.006976 -> **0.006921** | 1.41145 -> **1.39664** |
| L100/10 (5 parts) | 1,930.91 -> 1,915.45 | 19.2 cm2 | | |
| L120/12 (5 parts) | 2,772.27 -> 2,754.14 | 27.5 cm2 | | |
| L130/65/8 (2 parts) | 1,521.97 -> 1,508.99 | 15.1 cm2 | | |
| L200/100/10 (3 others) | 2,948.29 -> 2,924.15 | 29.2 cm2 | | |

Checks against figures that share no code with this tool:

- **#10087 volume**: 0.0074681 here, 0.0074681 by hand (above), IfcOpenShell
  0.9 0.00747, Monte Carlo 0.007446 ± 0.000029 (0.8 sigma). Was 0.007526.
- **#10087 area**: 1.50586 here, IfcOpenShell 1.50562, Crofton 1.5062 ±
  0.0041. **#10618**: 1.39664, IfcOpenShell 1.39641, Crofton 1.399 ± 0.004.
  Both 0.016% from IfcOpenShell (the toe arcs are chords here), where they
  were 1.0% high.
- **Sections**: every angle's section now rounds to the area EN 10056-1 lists
  for it; before, each was 0.7 to 0.9% over.
- Tekla's stored NetVolume (0.007399 on #10087) is the section with no radii
  at all, as before: the stored-vs-computed classes on Mini Project are
  unchanged (GrossVolume 637 pairs, 615 agree, 22 simplified-section; NetVolume
  2,636 pairs, 2,516 agree, 120 simplified-section).

Mini Project's coating column falls 0.171 m2 (605.024 to 604.853 m2) and its
computed steel volume 0.00057 m3.

Tests: `geom.test.mjs` adds the L section (area, which corners round, the "no
edge radii" variant), I/U/T/Z toe areas, and the notched L's volume to 40
mm3. All three fail on the previous code.

## What this does not show

- The toe placement on a real I, U, T or Z section with a non-zero edge
  radius: no public model here has one, so those are checked against the IFC
  figures and hand areas only.
- The sloped-flange variants (`FlangeSlope`, `LegSlope`) are still refused,
  as before.
