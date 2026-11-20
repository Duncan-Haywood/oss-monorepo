# Joined walls, averaged faces and copied host figures, 2026-11-20

Follows [faceted-causes-2026-11-20.md](faceted-causes-2026-11-20.md), which
left 358 stored areas on the eight models unexplained. Two groups were named
there: C20-Institute's 54 wall side areas 2-4% under the geometry (ArchiCAD)
and skolebygg's 111 curtain-wall mullions whose stored CrossSectionArea is
neither their section nor their length times one constant (Revit). Both
groups now have a cause, read off the files and checked against something
other than the figure being explained.

**Data.** The same eight models at the same commits (`opensourceBIM/IFC-files`
`cb96c50`; `ThatOpen/engine_web-ifc` `5ba2467`, `tests/ifcfiles/public/`).
`node eval/areas-vs-stored.mjs <8 files> --json eval/areas-vs-stored-2026-11-20-joins.json`
(output in `areas-vs-stored-2026-11-20-joins.txt`).

## 1. ArchiCAD's side area is a finishes figure

C20 wall #31190 (Wand-002) is 18 m by 2.7 m with twelve 1 x 1.5 m windows.
The geometry and ArchiCAD's own gross face areas ("Brutto-Wandoberflächenbereich
an der Außenseite / Innenseite") are 48.6 m2 each. Its `BaseQuantities` say
GrossSideArea 46.845 and NetSideArea 28.845. ArchiCAD's own quantity set in
the same file holds the answer:

| ArchiCADQuantities | m2 |
|---|---:|
| Netto-Oberflächenbereich an der Außenseite (outside, net) | 30.60 |
| Netto-Oberflächenbereich an der Innenseite (inside, net) | 27.09 |
| mean | **28.845** = NetSideArea |
| + Oberflächenbereich der Fenster in der Wand (windows) | 18.00 |
| | **46.845** = GrossSideArea |

So the exporter's side area is the mean of the two faces' net areas, and its
"gross" puts the openings back on that. The inside face is 3.51 m2 smaller
than the outside because other walls stand against it: five 0.2 m partitions
start on #31190's path (`IfcRelConnectsPathElements` with `.ATPATH.` on the
relating side), and the strip each one covers is not a surface anyone will
plaster or paint.

That gives a rule that needs no vendor names: stored side area = computed
side area - (sum of the widths of the walls T-joined to it) x height / 2,
the widths taken from those walls' own geometry and the height from this
wall's body. Within 0.5% (the centre-line rule's tolerance):

- **joins-off: 37 pairs** (C20 17 gross and 19 net, FZK-Haus #18698's net 1).
- **faces-averaged: 18 pairs** (C20) where the joins in the file account for
  only part of the inside face's loss: #31190's five partitions explain 1.0 of
  the 1.3 m missing, the rest presumably the end of a wall at an L-corner
  (three are joined at its ends, `.ATSTART.`/`.ATEND.`, and box overlap cannot
  tell which one runs past the corner, so this is not claimed). These 18
  match the mean of ArchiCAD's own two net face figures exactly; the rule reads
  the German quantity names this export uses, and an ArchiCAD export in
  another language would need its names added.

Both keep the stored figure as trustworthy (a bill of quantities for
finishes wants the area net of abutting walls); the computed middle-plane
area is what a formwork or masonry quantity wants.

## 2. skolebygg's mullions carry their curtain wall's figures

The 111 unexplained mullions fall into two groups by stored value:

| Group | Pieces | Stored Length | Stored CrossSectionArea | Section (geometry) |
|---|---:|---:|---:|---:|
| `50x180 Glassfasade 6-7` | 59 | 20.858 m | 138.4225 m2 | 0.01335 m2 |
| `50x120 Glassfasade 1-5` | 52 | 0.55 m | 0.6875 m2 | 0.01035 m2 |

Every piece in a group stores the same Length although their bodies run from
0.27 to 3.63 m (first group) and 0.46 to 1.25 m (second). The figures are not the mullions' at all: curtain wall #45538
(`Curtain Wall:Glassfasade 7`) has Revit "Dimensions" Area 138.422511233018
and Length 20858.000170668 mm, digit for digit, and #923565
(`Curtain Wall:YV 100 S`) has Area 0.6875. Revit's own per-mullion figures
agree with the geometry instead: #47061's "Dimensions" Volume 0.0207459 m3 /
Length 1.554 m = 0.01335 m2, the computed section.

Rule (`host-figure`): three or more members storing the same Length and
CrossSectionArea, with bodies whose lengths differ by more than 2% and a
stored area at least five times the computed section. It names exactly the
111 and nothing else on the eight models. The stored figure is marked not to
be trusted, so the bill of quantities uses the section.

## Result

| | before | after |
|---|---:|---:|
| Pairs | 12,167 | 12,167 |
| Agree | 9,451 | 9,451 |
| Unexplained | 358 | **192** |

"Before" is main as of this morning: the advanced-brep PR (#17830) had already
moved kleine_Wohnung's NetSideArea from 173 to 210 pairs, all agreeing or
explained, so pairs and agreements differ from the 12,130 / 9,420 of
faceted-causes-2026-11-20.md while the unexplained count stayed 358. The new
rules move exactly the 166 pairs above (37 + 18 + 111) and no other pair. Of the 192 left: 77 cross-sections (HHS architect's 58
Revit mullions storing 0.51-0.66 m2 against a 0.0095 m2 post, schependomlaan's
17 foundation beams, C20's two columns storing twice their perimeter), 72
slab and covering areas (schependomlaan, Mini Project's four KONZOLE pieces),
43 wall side areas (schependomlaan 30, skolebygg 13).

## What this does not show

Two exporters (ArchiCAD for the joins, Revit for the host figures), named from
three files. The joins rule is exact on 37 pairs but has not been tried on an
ArchiCAD export where partitions abut both faces. HHS architect's 58 mullions
look like the same habit as skolebygg's (one figure per type) but store no
Length at all, so the rule does not take them; they stay unexplained.
