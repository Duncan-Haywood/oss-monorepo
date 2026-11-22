# Faces that meet on the axis read, and the five unexplained curved breps traced, 2026-11-22

**Question.** [curved-breps-2026-11-20.md](curved-breps-2026-11-20.md) left one
kleine_Wohnung brep, #162827 (mapped onto 6 elements), not read as "a face that
goes once round a closed surface", and four curved breps (plus #207801, found
since) whose volumes disagreed with IfcOpenShell for no named cause. Can the
first be read, and do the disagreements have a cause?

**Data.** `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`
(ISSUE_159_kleine_Wohnung_R22.ifc and FM_ARC_DigitalHub.ifc, blob-less sparse
clone). Reference: IfcOpenShell 0.9.0.post1 (pip), 0.05 mm / 0.02 rad, as in
`eval/ifcopenshell-volumes.py --breps`.

## #162827 is a domed basin bottom, not a face round the surface

Its eight faces: a half disc top (two planes), a short cylinder band (two
halves, r 0.15 m), a 2 mm fillet (two halves of a torus) and a dome (two
halves of a surface of revolution whose profile is a 0.2417 m circle reaching
the axis at z -0.0669 m). Each dome half is bounded by half the rim and two
meridians that meet **on the axis**.

At a point on the axis the angle round it means nothing. The loop runs half a
turn round the rim, down the meridian at angle 0 to the axis, and up the
meridian at angle pi. Unwrapping the angle from point to point has to choose
+pi or -pi at the step past the axis; `Math.round(0.5)` chose the one that
made the total a whole turn, so the face was reported as wrapping round the
surface. The half cone in `surface.test.mjs` had passed only because its loop
ran the other way and rounded the other way.

**Fix (`geom.mjs`, `surfaceTriangles`).** Points where a parameter pinches are
found before the closed-surface test (they were found only after it). A
pinched periodic parameter is unwrapped from the last point where it means
something, and if the loop then winds a whole turn and passes a pole, the
turn is put on the step across the pole, where it costs nothing. A face that
really goes round its surface (no pole on its bound) is still refused, as the
existing test checks. A circle profile centred on the axis (a sphere) took
no meridian direction ("revolved profile on the axis"); it now takes one in
the circle's plane.

**Tests.** `surface.test.mjs`: a hemisphere bowl in two halves meeting on the
axis, both loop directions, volume 2pi/3 and the section at z -0.5 within
0.3%. With the pole change removed, the reversed one fails with "face round a
closed IFCSURFACEOFREVOLUTION". 10 of 10 pass; the venture's 191 pass.

**The volume, three ways.**

| | m3 |
|---|---:|
| This tool | 0.0020392 |
| Pappus on the meridian profile (cylinder band, fillet arc, dome arc; `2 pi x first moment`, 400,000 arc points) | 0.0020402 |
| IfcOpenShell as built | 0.0019012 |
| IfcOpenShell's triangles turned to agree | 0.0020395 |

This tool is 0.05% light of the formula, as inscribed triangles should be
(the 2026-11-20 range is 0.02-0.3%). kleine_Wohnung now reads 775 of 775
advanced breps ([pole-faces-vs-ifcopenshell-2026-11-22.txt](pole-faces-vs-ifcopenshell-2026-11-22.txt)).

## IfcOpenShell turns some curved faces inside out

IfcOpenShell's mesh of #162827 matches the exact profile wherever a vertical
ray crosses it (r 0.01 to 0.1497 m, three angles each, within 0.02 mm), and
every edge is used by two triangles, yet it encloses 6.8% less. Its 99,540
fillet triangles face inward: 1,260 directed edges, all on the fillet's seams,
are not paired with their reverse. Turning every triangle to agree with its
neighbours (`eval/ifcopenshell-orient.py`, breadth-first over shared edges)
gives 0.0020395.

The same check on every curved brep left unexplained
([ifcopenshell-orient-2026-11-22.txt](ifcopenshell-orient-2026-11-22.txt)):

| Brep | This tool | IfcOpenShell | Unpaired directed edges | IfcOpenShell turned | Gap left |
|---|---:|---:|---:|---:|---:|
| kleine_Wohnung #162827 | 0.0020392 | 0.0019012 | 1,260 | 0.0020395 | 0.02% light |
| kleine_Wohnung #207801 | 1.6549e-5 | 1.3904e-5 | 1,404 | 1.6560e-5 | 0.07% light |
| FM_ARC_DigitalHub #121421 | 0.110598 | 0.105378 | 1,786 | 0.110598 | 0.000% |
| FM_ARC_DigitalHub #128967 | 2.27022e-4 | 2.88111e-4 | 2,520 | 2.27049e-4 | 0.01% light |
| FM_ARC_DigitalHub #130735 | 1.33070e-5 | 2.17321e-5 | 1,393 | 1.33468e-5 | 0.30% light |

All five unexplained curved disagreements are IfcOpenShell meshes with faces
turned the wrong way; turned, they agree with this tool within the inscribed
mesh's 0.02-0.3%. kleine_Wohnung's #207997 (a ruled B-spline brep, 0.2%
light here) has every edge paired, so it is a plain tessellation gap, as the
2026-11-20 tolerance sweep showed. This adds a cause for
`eval/breps-vs-ifcopenshell.mjs` to test when the reference carries
the turned figure; for now it is this file and the script.

## What is left

- A face whose bound goes round a closed surface with no pole on it (a full
  band between two circles, a cap round a pole inside the face): needs a seam
  cut in (u, v). None in these two models now.
- FM_ARC_DigitalHub's 2 torus breps with bounds 5e-3 of their size off the
  surface and 3 with cylinder faces the cylinder reader does not take
  (unchanged).
- `ifcopenshell-volumes.py --breps` could write the turned figure next to the
  raw one, so the comparison names this cause itself.
