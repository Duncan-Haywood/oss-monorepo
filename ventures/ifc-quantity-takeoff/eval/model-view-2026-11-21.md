# The model view draws the measured solid (2026-11-21)

**Question.** The page now shows the model in 3D (`viewer.mjs`, WebGL, no
library) so an estimator can see which elements a bill-of-quantities line
holds and which stored quantities disagree with the geometry. Is what it
draws the solid the takeoff measured, and is it quick enough for a browser?

**Why it is not trivial.** The takeoff's solids (`geom.mjs`) are signed sums
of convex pieces: a concave profile is fanned from one vertex into positive
and negative triangles, an opening enters as a negative piece. Drawing the
positive pieces' faces would show the fan's extra triangles and no openings.
`view-mesh.mjs` draws only the boundary:

- **Extrusions** (every piece a prism on one base plane with one extrusion
  vector, which is what an unclipped extruded profile is): the fan's
  diagonals appear twice with opposite weight and cancel, leaving the
  profile's own edges. Sides are those edges swept; caps are the outline
  (holes bridged in) ear-clipped, or trapezoids of positive winding when
  the outline does not close into loops.
- **Anything else** (clipped, joined, openings cut): each piece face is cut
  by the planes of the pieces overlapping it, and a part is kept where the
  signed count of pieces holding a point is positive on one side and not on
  the other; a coplanar part already drawn by an earlier piece is skipped.
- Faceted bodies keep the faces the file gives. Elements past 250 pieces, a
  budget of 40,000 polygon cuts, or 40,000 triangles are drawn as their box
  (a count, not a clock, so a model always draws the same way); their
  quantities are unaffected.

**Check.** For every element drawn from pieces, the volume its triangles
enclose (divergence theorem, from the first vertex so float32 rounding of
site coordinates does not swamp it) is compared with the volume the takeoff
computed for the same solid (net where openings were cut). A leaking
boundary, a doubled face or a kept fan triangle encloses a different volume.

`node eval/model-view.mjs <models> --json eval/model-view-2026-11-21.json`
(output: `model-view-2026-11-21.txt`). Models: the sample, and the public
files used by the other evals (sparse clones of `ThatOpen/engine_web-ifc` at
`tests/ifcfiles/public/` and `opensourceBIM/IFC-files` `HHS Office/`).

| Model | Elements | Drawn | As boxes | Checked | Enclosed = computed (0.5%) | Meshing |
|---|---:|---:|---:|---:|---:|---:|
| sample-office | 7 | 7 | 0 | 7 | 7 | 0.1 s |
| IfcOpenHouse_IFC4 | 34 | 34 | 0 | 34 | 33 | 0.0 s |
| AC20-FZK-Haus | 82 | 81 | 0 | 18 | 18 | 0.1 s |
| duplex | 215 | 195 | 10 | 148 | 148 | 0.9 s |
| C20-Institute-Var-2 | 701 | 697 | 0 | 128 | 128 | 0.1 s |
| Mini Project (Tekla) | 2,636 | 2,631 | 24 | 2,274 | 2,271 | 8.2 s |
| kleine_Wohnung_R22 | 425 | 400 | 7 | 263 | 263 | 3.5 s |
| schependomlaan | 3,569 | 3,545 | 65 | 561 | 561 | 0.6 s |
| ARK_NUS_skolebygg (56 MB) | 4,459 | 4,381 | 329 | 3,369 | 3,243 | 35 s |
| HHS Office architect | 2,527 | 2,394 | 2 | 2,207 | 2,207 | 2.1 s |
| HHS Office construction | 339 | 327 | 0 | 305 | 305 | 1.4 s |
| **All 11** | **14,994** | **14,692** | **437** | **9,314** | **9,184 (98.6%)** | |

"Drawn" leaves out elements with no body and no box. "Checked" leaves out
faceted bodies (4,935, drawn as the file gives them) and box fallbacks.
Times are Node 22 on the session's container, single thread; the page does
the same work in 30 ms slices and draws as it goes.

**Update, same day (eval/item-union-2026-11-21.md):** 128 of the 130 were
the takeoff over-counting overlapping body items; one was this mesher
missing a cut 5 um off a face. After the fixes, 9,310 of 9,312 agree
(`model-view-2026-11-21-union.txt`). The paragraph below is the first
reading.

**What the 130 disagreements are.** 126 are on ARK_NUS; the five worst are
furnishing elements whose drawn solid holds 56% of the computed volume.
Not traced yet: the general method's coplanar rule is the first suspect
(it decides which of two overlapping pieces draws a shared face). One Tekla beam (#1717) is 11.8% over. They are left as
found: the view draws these elements, imperfectly, and the quantities do
not come from the view.

**Getting it fast enough.** First version: 33 s for the sample's one IPE 200
beam (369 pieces from its root-radius arcs). Cutting only the part of a face
inside each overlapping piece, skipping pieces that only touch, and a quick
separating-plane test brought it to 1.3 s; the extrusion shortcut to 40 ms.
Mini Project went from 114 s to 8 s, and the hollow sections' caps from
trapezoids to bridged outlines cut its triangles from 2.47M to 1.82M (round
tubes keep the geometry's 360-segment arcs, so they stay heavy).

**Limits.** The view draws the gross body where the net could not be
computed; it shows no textures, storeys hidden or sections. Picking reads an
id buffer, so an element hidden behind another cannot be clicked: use a
bill-of-quantities line or a check row instead.
