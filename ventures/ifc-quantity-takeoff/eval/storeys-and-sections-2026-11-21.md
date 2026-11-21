# Storeys and a section plane in the model view (2026-11-21)

**Question.** The model view (eval/model-view-2026-11-21.md) drew the whole
building at once, so an estimator could not look at one floor or inside a
wall build-up. Can the page hide storeys and cut a section without
re-meshing, and does each storey it lists hold the elements on that floor?

**What was built.**

- `viewer.mjs`: `setVisible(fn)` draws only the elements `fn` keeps, as
  merged vertex ranges (`visibleRuns`: the whole model is one draw call, one
  hidden storey splits it into a few), so hiding a storey uploads nothing.
  `setSection({ n, d })` discards fragments where `n.p > d` in the shader, in
  the drawing pass and the picking pass, so a click never selects something
  that was cut away. A face seen from behind (normal away from the eye) is
  the inside of a cut solid and is drawn flat grey, as a cut is drawn on a
  section; the mesher's normals point outward (every closed element
  encloses a positive volume).
- `view-mesh.mjs`: `storeyList(rows)` lists storeys lowest first by their
  elevation, with element counts; elements with no storey last.
- The page: a tick box per storey (hidden when the model has one), and a
  section: plan cut, or vertical across x or y, with a slider and a "keep
  the other side" box. A plan cut starts 1.2 m above the bottom of what is
  shown, where a floor plan is cut. Choosing a bill-of-quantities line whose
  elements are on a hidden storey ticks that storey back on.

**A takeoff fault it turned up.** The first storey list for ARK_NUS
(`node eval/storeys.mjs`) had 198 entries: 5 floors and 193 room numbers
("01056", "02104"). The exporter places furniture, fittings and some walls
in an `IfcSpace`, and `qto.mjs` read whatever spatial element contained an
element as its storey. The same fault split kleine_Wohnung's 4 storeys into
15, and grouped the bill of quantities "by storey" into rooms. Now an
element contained in a room climbs the spatial tree (`IfcRelAggregates`) to
the `IfcBuildingStorey` above the room, and keeps the room's long name (else
its name) as a new `space` field.

| Model | Storeys listed before | After | Elements whose storey changed | Uniformat codes changed |
|---|---:|---:|---:|---:|
| IfcOpenHouse_IFC4 | 1 | 1 | 0 | 0 |
| AC20-FZK-Haus | 2 | 2 | 0 | - |
| C20-Institute-Var-2 | 5 | 5 | 0 | 0 |
| Mini Project (Tekla) | 1 | 1 | 0 | - |
| kleine_Wohnung_R22 | 15 | 4 | 37 | 0 |
| HouseZ | 4 | 4 | 0 | 0 |
| ARK_NUS_skolebygg | 198 | 5 | 1,268 | 0 |

(Storey lists: `storeys-2026-11-21.txt` / `.json`, after the fix.
"Elements whose storey changed" and the Uniformat column compare the
takeoff before and after on the same files; "-" was not run.) The
Uniformat below-grade rule reads the storey's elevation, so moving 1,268
ARK_NUS elements onto real storeys could have recoded them; none moved,
because the rooms' contents are furniture, fittings and partitions the
rule does not look at.

**Plan cut heights.** On every storey with an elevation, the starting cut
(1.2 m above the bottom of that storey's elements) lands between that
storey's floor and the next one up: C20 cuts at -2.10, 0.90, 3.90, 6.90 and
9.90 m for storeys at -3, 0, 3, 6 and 9 m. Storey elevations are relative to
the building, so they cannot be used for the cut directly: kleine_Wohnung's
storey "0,000" sits at 498.3 m in world coordinates.

**Checked in a browser** (Chromium, SwiftShader WebGL, `python3 -m http.server`):
FZK-Haus and C20 load, the storey boxes list as above, hiding all but one
storey and plan-cutting it shows that floor's walls cut at 0.9-1.2 m with
grey cut faces, an x cut through the middle shows the rooms, and a click at
the centre of a cut view picks a slab on the kept side. At phone width
(iPhone 13 emulation) the controls wrap with no horizontal scroll. A bug
found there: the label first printed the cut height with `Math.abs`, wrong
for a plane below the view's origin (7.85 m shown for a 0.9 m cut); fixed.

**Left.** Meshing in a Web Worker (ARK_NUS still takes 35 s on the main
thread in 30 ms slices); a cut that draws capped faces (the grey inside
faces stand in for them); a camera that looks straight down for a plan cut.
