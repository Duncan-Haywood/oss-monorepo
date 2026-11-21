# Profile outlines thinned for display (2026-11-21)

**Question.** geom.mjs samples every arc at 360 segments to the turn, so its
areas and volumes are within 5e-5 of the true curve. The model view drew
those same points: a rectangular hollow section with 2 mm corner radii was
2,912 triangles, and the Tekla Mini Project was 1.82 million triangles,
1.72 million of them beams. Can the view draw far fewer without drawing a
different solid?

**What changed** (`view-mesh.mjs`, display only; quantities never come from
these meshes):

- `thinLoops`: when an element is an extruded profile (the `prismFamily`
  shortcut), each outline loop of more than 24 points is simplified by
  Douglas-Peucker with a tolerance of 5e-4 of the loop's box diagonal
  (`DISPLAY_TOLERANCE`), then scaled about its centroid back to its own
  area, as geom.mjs gives a sampled circle its area-preserving radius. A
  unit circle's 360 points become 64.
- The sides are rebuilt from the thinned loops, so sides and caps share
  their edges and the solid stays closed.
- Refused (the full outline is drawn) when the loops' total area moves more
  than 0.2%, when any two edges of the thinned outline cross (a wall too
  thin for the tolerance), or when the holes cannot be bridged.

Why scale back: the first version without it thinned none of Mini Project's
254 hollow sections. An inscribed polygon is about 0.1% small; on a ring of
1.4 mm wall round an 85 mm section that is several per cent of the ring's
area, past the 0.2% guard.

**How it was checked.** `node eval/model-view.mjs <the 11 models> --json
eval/model-view-2026-11-21-thin.json` (output
`model-view-2026-11-21-thin.txt`), the same models and check as
`model-view-2026-11-21-union.txt`: the volume the drawn triangles enclose
against the volume the takeoff computed, within 0.5%.

| Model | Triangles before | After | Enclosed = computed (0.5%) |
|---|---:|---:|---:|
| sample-office | 2,990 | 2,990 | 7 of 7 |
| IfcOpenHouse_IFC4 | 528 | 528 | 34 of 34 |
| AC20-FZK-Haus | 18,486 | 18,486 | 18 of 18 |
| duplex | 30,402 | 30,402 | 148 of 148 |
| C20-Institute-Var-2 | 35,556 | 35,556 | 128 of 128 |
| Mini Project (Tekla) | 1,822,928 | **415,880** | 2,272 of 2,274 |
| kleine_Wohnung_R22 | 1,455,465 | 1,455,465 | 263 of 263 |
| schependomlaan | 254,498 | 225,166 | 561 of 561 |
| ARK_NUS_skolebygg | 2,460,105 | 2,346,241 | 3,367 of 3,367 |
| HHS Office architect | 224,470 | 153,266 | 2,207 of 2,207 |
| HHS Office construction | 381,850 | 381,850 | 305 of 305 |
| **All 11** | **6,687,278** | **5,065,830** (-24%) | **9,310 of 9,312** |

The two Mini Project beams outside 0.5% (#32178, #32308, 0.53% and 0.51%)
were outside it before, at the same figures: they are not extruded
profiles, and this change does not touch them. Mini Project's beams went
from 1,718,074 triangles to 323,394.

What it saves in the browser: the viewer keeps 63 bytes a triangle on the
GPU (float positions, byte normals, colours and pick ids; viewer.mjs
`_write`), and the worker sends 72 bytes a triangle to the page (float
positions and normals). Mini Project goes from about 115 MB to 26 MB on the
GPU and 131 MB to 30 MB through the worker. Meshing time did not change
(6.3 s on Mini Project here): it goes to the general method on cut members,
not to the extruded ones. This run did not measure frame times: the
responsiveness eval stubs out `drawArrays`, because software GL in this
container does not tell you what a GPU would do.

**Limits.** Only extruded profiles are thinned. Elements the general method
draws (members with cuts and copes, 192k triangles on Mini Project) keep
their 360-segment arcs. kleine_Wohnung's 1.46M triangles are 136 faceted
bodies drawn as the file gives them (1,446,034 triangles; its 17 extruded
profiles are 706): the exporter's own mesh, which a display-only decimator
for triangulated face sets would have to thin. Swept disks and revolved
solids are still drawn as their boxes.
