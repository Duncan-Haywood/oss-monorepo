# Three brick-band copings store their underside, 2026-11-24

**Question.** [net-on-a-face-2026-11-24.md](net-on-a-face-2026-11-24.md)
left 1 volume and 3 areas in doubt over 15 public models: figures the bill of
quantities sums although they disagree with the geometry for no named cause.
The three areas are schependomlaan's `afdekker` coverings #44220, #691798 and
#739532 (`ThatOpen/engine_web-ifc`, `tests/ifcfiles/public/schependomlaan.ifc`,
an ArchiCAD export), `GrossArea` and `NetArea` 0.0611, 0.11895 and 0.195 m2
against a computed 0.0101 m2 each. What are they?

**Data.** The same 15 models (HHS Office architect and construction from
`opensourceBIM/IFC-files`, 13 from `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/`), blob-less sparse clones, not committed.

**Method.** #44220's STEP lines read by hand; each coping's per-plane face
areas printed from `takeoff()`; then every row's named cause and each model's
BoQ totals compared between `main` and this change
([signed-faces-reasons-2026-11-24.txt](signed-faces-reasons-2026-11-24.txt)),
and the doubt sweep rerun: `node eval/in-doubt.mjs <files>`
([in-doubt-2026-11-24c.txt](in-doubt-2026-11-24c.txt)).

## What the file says

#44220's body is one `IfcExtrudedAreaSolid` of the profile
`IFC_Vebo_spekband_SB 60/70x150` (a precast brick band), 150 mm wide and 70
mm high, extruded 470 mm *along its length* (horizontal). The profile's
underside runs from x = -110 to 5 mm, a half-round drip groove of radius 10
mm from 5 to 25, then flat again from 25 to 40; its top has a 40 x 10 mm
chamfer. ArchiCAD's own quantity set on it says:

| ArchiCAD quantity | value | reading |
|---|---:|---|
| Bottom Surface Area | 0.0611 m2 | (115 + 15) mm x 470 mm: the flat underside, groove left out |
| Top Surface Area | 0.0517 m2 | 110 mm x 470 mm: the flat top, chamfer left out |
| End Surface Area | 0.0203 m2 | about the two ends (2 x 0.010143 = 0.020286; ArchiCAD 0.2% higher) |
| BaseQuantities GrossArea, NetArea | 0.0611 m2 | the Bottom Surface Area |

So the stored `GrossArea` is the coping's flat underside. The other two copings
are the same profile run 915 and 1,500 mm (0.11895 = 0.13 x 0.915, 0.195 =
0.13 x 1.5).

## Why the engine missed it

The engine cuts a covering across its extrusion direction (the quantity set's
area is "the extruded area"), which for a coping extruded along its run is the
profile: 0.010143 m2 = 150 x 70 less the chamfer (200 mm2) and the groove
(157 mm2). That figure is right for what it is, and wrong as a plan area, so
`explainAreas` tries the body's flat faces (`a-body-face`, the cause ArchiCAD
sills already carry). It could not here: the profile with its arc is built as
a signed sum of pieces, and `planeAreas` declined any body of more than one
term, because pieces share inner faces that are not the body's surface.

Summed with their signs, they are not. Each term's face loops now count as
area vectors times the term's sign, plane by plane: a face two pieces share
appears once from each side and cancels, and a face a negative piece cuts out
of a positive one comes off it. What is left in each plane is the body's own
boundary there. `planeAreas(s, true)` does this; the coping's planes then
read 0.0611, 0.11895 and 0.195 m2 for the underside plane, to 1e-9, and the
existing `a-body-face` rule names all six figures. A unit test builds a
coping as a box less a groove box (underside 0.13 x 0.47 = 0.0611) and two
boxes sharing a face (the shared face drops out).

Only the plan-area check reads it this way. `surfaceArea` (the coating area
of steel parts) still declines bodies of several terms, so the coating
figures in [coating-area-2026-11-24.md](coating-area-2026-11-24.md) are
untouched; whether it should read cut steel net of its cuts this way is a
separate check.

## What changed

Six rows on one model, and no others over the 15 (the reasons file lists every
change). BoQ volume and area totals are identical on all 15 before and after:
`a-body-face` keeps the stored figure, as the unexplained row did, but the
line no longer warns.

| | before (net-on-a-face) | after |
|---|---:|---:|
| volumes in doubt, 15 models | 1 | 1 |
| areas in doubt | 3 | 0 |
| models with nothing in doubt | 13 of 15 | 14 of 15 |

The one left is ARK_NUS #1167770's volume, 2.04% over its body with no
opening (net-on-a-face-2026-11-24.md, "The volume: left in doubt"): a plausible
Revit join clean-up, not a shown one.

## What this does not show

- That ArchiCAD always stores a horizontally extruded covering's underside as
  its area. Three elements of one profile in one model do; the other face
  ArchiCAD could have picked (the top, 0.0517) is listed as its own quantity,
  so the choice is the exporter's, not an accident of these three.
- That the signed per-plane sum is the true surface where one plane holds
  both an upward and a downward face of the same body (a step whose tread and
  an overhang's soffit are coplanar): they cancel as vectors, as they already
  did for single-term bodies.
- Whether the BoQ should price a coping by its underside, its top or its run.
  It sums the stored underside, as the exporter wrote it, now with a named
  cause.
