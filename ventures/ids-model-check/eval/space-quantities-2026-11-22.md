# Spaces' base quantities from their own solids, 12 public IFC exports, 2026-11-22

**Question.** BIM execution plans and FM handover IDS files ask every
`IfcSpace` for `Qto_SpaceBaseQuantities`: floor area for the room schedule and
lettable area, perimeter for skirting, height and volume for HVAC sizing. Many
exports carry none (Revit writes base quantities only when the export is told to), so the
model fill sent every one to the to-fill table. IFC Quantity Takeoff already
measures each space's solid (`rooms.mjs`, its 2026-11-21 room schedule). Which
of the thirteen `Qto_SpaceBaseQuantities` names can that reading fill, and
under which conditions does it give the figure exporters store?

**Data.** `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (blob-less sparse
clone, not committed): every file there with an `IfcSpace`. Stored space
quantities in eight of them: ISSUE_068_ARK_NUS_skolebygg (Revit 2019, 307
spaces), ISSUE_159_kleine_Wohnung_R22 (Revit 2022, 28), schependomlaan
(ARCHICAD NED, 100, 94 drawn only as an outline and a box), C20-Institute-Var-2,
AC20-FZK-Haus and ISSUE_005_haus (ARCHICAD GER, 82, 7, 7), ISSUE_034_HouseZ
(Rhino, 5). Four more with spaces but only localised Revit names
(dental_clinic, Office_A_20110811, duplex, FM_ARC_DigitalHub) and example.ifc
are filled but have nothing to compare.

**Method.** First every stored space quantity was set against the matching
room figure, per authoring tool, and split by whether the solid is a prism
(its volume within 2% of floor area x height) and whether a `CEILING`
covering's underside sits at its top. The rules below came from that table.
Then `node eval/space-quantities-fill.mjs <files> --json
eval/space-quantities-2026-11-22.json --out DIR` (output
`space-quantities-2026-11-22.txt`) hides every stored quantity with one of
the eight offered names (renamed `<name>AsExported`), runs the model fill with
`--from-geometry` against `space-quantities/space-quantities.ids.xml` (eight
specifications, one name each, on every `IfcSpace`) and compares each written
value with the figure the exporter had stored. `python3
eval/space_quantities_ifctester.py DIR` (IfcTester 0.9.0) gives the
independent verdict on the hidden and the filled copies.

## The rules

| Name | Offered on | Why |
| --- | --- | --- |
| `GrossFloorArea` | every space whose section was cut | the solid is the gross floor |
| `NetFloorArea` | Revit exports only | a Revit room already stops at columns and finishes; ARCHICAD GER stores gross x 0.97 (the room's "Reduzierte Fläche"): 2 of 96 rooms equal to the solid |
| `GrossPerimeter` | every space whose section was cut | |
| `Height` | constant-height spaces whose top is not a ceiling's underside | the `Qto_` definition gives Height only for a constant-height space, measured slab to slab; ARK_NUS's lowered ceilings stop the Revit room solid 2.64 m up while the stored Height is the nominal 2.9 m |
| `FinishCeilingHeight` | constant-height spaces | the solid's top is the finished ceiling, lowered or not |
| `GrossCeilingArea` | constant-height spaces | a flat ceiling's area is the floor's |
| `GrossVolume` | where `Height` is, and only from a body | exporters store floor area x nominal height: ARCHICAD under a sloped roof (stored about twice the solid: ratio 0.46-0.51), Revit over a lowered ceiling |
| `NetVolume` | spaces with a body | an outline through its box holds more than a room under a sloped roof (11 schependomlaan rooms, 3-9%) |

Not offered: `NetPerimeter` (the definition takes door openings off; the
exporters here store the gross figure, so it cannot be checked), `NetCeilingArea`
(ARCHICAD's 0.97 again), `GrossWallArea` and `NetWallArea` (stored figures
match perimeter x height on 8 of 32 schependomlaan rooms and 79 of 82 C20 ones;
what they deduct differs by tool), `FinishFloorHeight` (no floor build-up in
the solid).

The ceiling test: a covering with predefined type `CEILING` whose box overlaps
the room's plan by more than 5 cm each way and whose bottom is within 3 cm of
the room's top. On ARK_NUS's 280 constant-height rooms with a stored Height,
it marks 53: 29 of the 30 whose stored Height disagrees, and 24 that agree
(those are held back: a missing value goes to the table, a wrong one would
pass the check). The one miss it leaves is room #31188, whose solid is 0.68 of its stored Height
with no ceiling covering found at its top.

## Results (fill end to end, stored figures hidden)

| Name | written | with a stored figure | within 2% | explained otherwise | unexplained |
| --- | ---: | ---: | ---: | ---: | ---: |
| GrossFloorArea | 989 | 530 | 528 | | 2 (ARK_NUS #16527, #43208) |
| NetFloorArea | 788 | 334 | 332 | | the same 2 |
| GrossPerimeter | 989 | 470 | 467 | | 3 (ARK_NUS) |
| Height | 732 | 446 | 445 | | 1 (ARK_NUS #31188) |
| FinishCeilingHeight | 950 | 191 | 191 | | 0 |
| GrossCeilingArea | 950 | 191 | 191 | | 0 |
| GrossVolume | 638 | 352 | 125 | 218 ARK_NUS litres under m3 (exactly x 1000) | 9 (ARK_NUS: 1-2% off after the litre factor, and #16527) |
| NetVolume | 895 | 107 | 102 | 5 HouseZ mm3 under m3 | 0 |

6,931 values written on 12 models; every one passes the fill's own re-read,
and IfcTester takes exactly the written spaces from fail to pass on every
specification (`eval/space-quantities-2026-11-22-ifctester.txt`). The
unexplained ARK_NUS rooms are the ones the 2026-11-21 room schedule already
left unexplained (`../../ifc-quantity-takeoff/eval/rooms-2026-11-21.md`: the
ratios match 01109 lærerarbeid 0.60 and 01170 Utebod 0.24 for floor area, the
two M&H wcs 1.19 and the kantine 1.06 for perimeter); only a drawing of each
room would say which side is wrong.

What a Revit export with no base quantities gets: dental_clinic's 269 spaces
get 2,144 values, Office_A's 99 get 695 (Height on only 2: the ceiling test holds
the rest back, its rooms stopping at its 83 ceilings), FM_ARC_DigitalHub's 64 get 456.

## What it costs

Nothing new: the room pass was already part of `takeoff()`; the fill with
`--from-geometry` on ARK_NUS (307 spaces) takes 25-29 s, the takeoff's own time.

## Next

- A Revit export that stores `Height` over a lowered ceiling with its ceilings
  exported, to see whether the 24 held-back agreeing rooms can be told apart
  (they may be rooms whose upper limit is set to the ceiling).
- `NetPerimeter` with the door widths taken off, once an export stores a
  figure that differs from the gross one.
- The ARK_NUS rooms above, drawn.
