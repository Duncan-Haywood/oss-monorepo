# Railings' Length from their bodies (2026-11-22)

**Question.** The model fill's `--from-geometry` measured walls', members',
slabs', footings', openings' and spaces' quantities, but nothing on an
`IfcRailing`. `Qto_RailingBaseQuantities` has one quantity, `Length`, "the
total nominal length of the railing", and a balustrade, glass guard or
handrail is quoted per metre. Can it be read from a railing's body, and how
close is it to what exporters store?

## What the exporters store

The 36 IFC files of `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` and
`opensourceBIM/IFC-files` (`HHS Office`, `OpeningDesign.com`), sparse clones
as in `eval/member-lengths-2026-11-22.md`, hold 481 railings in 14 files. Two
files store a railing Length, both Revit:

- `ISSUE_159_kleine_Wohnung_R22` (Revit 2022, written out through
  IfcOpenShell): 8 railings with `Qto_RailingBaseQuantities.Length`;
- `ISSUE_068_ARK_NUS_skolebygg` (Revit 2019): 46 railings with a `Length`
  quantity.

What Revit stores is the railing's path length. The first kleine_Wohnung
railing's top rail is a U of 50 x 10 mm bars with mitred corners; its middle
line runs 2.539 + 5.948 + 2.539 = 11.026 m, and the export stores 11.03 m.

ARCHICAD stores no Qto_ railing length. Its own parameter `Länge (A)` is on
`AC20-FZK-Haus`'s two railings (2.00 and 4.29 m).

## The reading (`railings.mjs`)

A railing body holds posts, balusters, glass panels and rails, and no path.
The path is read off the top rail:

1. **Top surface.** Keep the body's upward faces (outward normal within 60
   deg of up) that nothing else lies above. That keeps the top rail's top
   and drops the posts' tops under it (at 0.89 m under a rail at 0.89 to
   0.90 m in kleine_Wohnung, which a height band alone did not separate: a
   first pass that kept every face within 3 cm of the top read 12.27 m for
   11.03).
2. **Runs.** Join the kept faces into runs where they share corners. A run is
   a rail when it is at least 10 times longer than it is wide, so a post top
   is not.
3. **Two readings per run, which must agree within 1%.**
   - *Strip.* A strip of width w along a polyline of length L, with mitred
     corners, has area L w and outline 2 L + 2 w, so L = P/2 - w where
     w (P/2 - w) = A. Faces are measured in 3D, so a sloped stair rail reads
     its own length. The outline is found edge by edge, grouped by the line
     each lies on and summed as signed coverage, so a face pair splitting
     their shared edge differently (a T-junction) still cancels.
   - *Sweep.* The volume of the pieces the run belongs to, over their
     cross-section cut square to the run at its largest face.
   On a tessellated round handrail the faces that pass the 60 deg test have a
   zigzag edge and the strip runs long (8.32 m for a stored 5.49, while the
   sweep says 5.55); a cut that catches a corner gives the sweep too large a
   section. Either way the two disagree and nothing is offered.
4. **Sum.** Separate runs (a balcony rail broken at a post) add up. A run
   lying in plan within 0.1 m of a longer run already counted is a second
   rail beside or under it and is not counted.

`addRailingLines` puts the result in the takeoff row; `GEOMETRY_QUANTITIES`
maps it to `Length` on `IFCRAILING`; `measureModel` (CLI `--fill
--from-geometry`, the page checkbox, the worker) calls it after the footings.

## Results

```
node --max-old-space-size=7000 eval/railing-lengths.mjs kleine_Wohnung_R22.ifc ARK_NUS_skolebygg.ifc --json eval/railing-lengths-2026-11-22.json   # > railing-lengths-2026-11-22.txt
```

| Model | Tool | Store a Length | Offered | Within 2% | Worst | Held: no rail on top | Held: readings disagree |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| kleine_Wohnung_R22 | Revit 2022 | 8 | 8 | 8 | 0.02% | 0 | 0 |
| ARK_NUS_skolebygg | Revit 2019 | 46 | 21 | 21 | 0.05% | 16 | 9 |
| **all** | | **54** | **29** | **29** | **0.05%** | **16** | **9** |

Every offered length is within 0.05% of the stored one. One of the 21 in
ARK_NUS (#1612657, stored 8.128 m) is two separate runs, 4.289 + 3.844 m;
taking only the largest run had read it at 4.29.

The 16 with no rail on top were looked at one by one (their body items'
types): each body is only upright extrusions (18, 44, 120 ... posts or
balusters), with no rail in it. Revit wrote the top rail elsewhere or not at
all, so the railing's own body cannot give its path.

The 9 that disagree: 4 tessellated round handrails on two stair flights
(#1596788 and #1617027, #1597495 and #1617623: the sweep within 1.1% of the
stored figure, the strip 52% long); 2 where the sweep's cut caught a corner
(#1588640, #1589898, sweep 10.30 and 3.97 for 20.08 and 8.82; the strip
readings of the rails under the top one are within 0.5% of the stored figure
on both, and #1589898's top run's strip within 0.01%, but the rule needs both
readings); 3 more (#1595788, #1600089, #1609024) with
several runs of which one disagrees.

**ARCHICAD.** FZK-Haus's two railings read 2.000 and 4.290 m, its own
`Länge (A)` exactly. That is not a Qto_ figure, so it counts as a second
tool's reading of the same thing, not as a stored Length.

## The fill end to end

```
node --max-old-space-size=7000 eval/railing-lengths-fill.mjs kleine_Wohnung_R22.ifc ARK_NUS_skolebygg.ifc --out DIR   # > railing-lengths-fill-2026-11-22.txt
python3 eval/railing_lengths_ifctester.py DIR    # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; > railing-lengths-ifctester-2026-11-22.txt
```

Every stored `IfcQuantityLength` named `Length` is renamed, the fill is asked
for `Qto_RailingBaseQuantities.Length` on every railing
(`eval/railing-lengths/railing-lengths.ids.xml`) with `--from-geometry`, and
each written value is compared with the hidden one:

| Model | Written from geometry | Pass the fill's re-read | Match the hidden figure | Left to the to-fill table | IfcTester before / after |
| --- | ---: | ---: | ---: | ---: | --- |
| kleine_Wohnung_R22 | 8 | 8 | 8 | 0 | 0 / 8 of 8 |
| ARK_NUS_skolebygg | 21 | 21 | 21 | 25 | 0 / 21 of 46 |

IfcTester takes exactly the written railings from fail to pass.

## On models that store none

`eval/railing-lengths-coverage-2026-11-22.txt` (`--all`): on eleven more
public models (ARCHICAD and Revit 2011 to 2022; `ifcbridge-model01`'s 8
railings were not run) 131 of 419 railings get a
Length: FZK-Haus 2 of 2, ISSUE_005_haus 2 of 2, schependomlaan 44 of 90,
advanced_model 14 of 14, FM_ARC_DigitalHub 13 of 13, Office_A 7 of 10, R8 MAB
3 of 10, dental_clinic 1 of 9, Schultz Residence 45 of 253, duplex 0 of 4,
C20-Institute 0 of 12. None of these can be checked against a stored figure.

## Next

- The 9 that disagree: a section cut placed by the run's own middle line
  rather than its largest face would likely fix the two corner cuts; the
  tessellated handrails need the strip read from a fitted tube, not from
  thresholded facets.
- A railing whose rail is its own element (the 16): read the path from the
  posts' line, or from the separate rail element, once an export stores a
  Length to check that against.
- An ARCHICAD or other tool's export that stores a Qto_ railing Length.
