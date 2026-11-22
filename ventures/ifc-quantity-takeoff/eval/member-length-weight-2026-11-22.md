# Member length and steel weight from geometry, 30 public IFC models, 2026-11-22

**Question.** The 2026-11-22 quality audit found that a beam or column with
no quantity set showed 0 m and 0 kg on its bill-of-quantities line, so a
per-metre or per-kg rate priced it at 0. How many members does that touch on
real models? Does the length read off the body agree with the stored Length
where both exist? Is 7,850 kg/m3 x volume close to the weight a steel
exporter stores?

**Data.** Every `.ifc` in blob-less sparse clones of `opensourceBIM/IFC-files`
(HHS Office construction and architect, OpeningDesign.com) and
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`: 30 models, 25 with
columns, beams, members or piles. One, Viadotto Acerno (IFC4X3), is not read
at all: its placements are `IfcLinearPlacement`, which `geom.mjs` does not
place yet. That failure predates this change, and it is logged in NEXT.md.

**Method.** `node eval/member-length-weight.mjs <files>` (raw output in
`member-length-weight-2026-11-22.txt` and `-b.txt`; the run was split in two
after the Viadotto crash, and schependomlaan was rerun after the fix below).

- **Length** (`memberLength` in `qto.mjs`): the body's extent along its
  extrusion direction. A faceted member uses the end-face normal it is longest
  along, the axis the cross-section cut already uses. Qto_BeamBaseQuantities
  defines Length as the total nominal length "not taking into account any
  cut-out's or other processing features", which is this extent. A pair
  agrees within 2%.
- **Weight** (`isSteel`, `STEEL_DENSITY`): applies when the material names
  plain steel (steel, Stahl, staal, acier, S235 to S690, ASTM A36/A500/A572/A992,
  Q235/Q345/Q355, SS400) and no part of it names concrete, timber, stainless,
  aluminium, fibre, rebar, neoprene, grout, paint or insulation. Every part of
  a layer set must pass, so "Concrete / Steel" is not steel. The weight is
  the volume the BoQ sums x 7,850 kg/m3 (EN 1991-1-1 Table A.4; AISC's
  490 lb/ft3). A stored weight always wins.

## Results

| Model | Members | Stored Length | Body agrees with it | New lengths | Host-figure | Steel | Density agrees with stored weight | New weights |
|---|---|---|---|---|---|---|---|---|
| AC20-FZK-Haus.ifc | 46 | 1 | 1 of 1 | 45 | - | 0 | - | 0 |
| C20-Institute-Var-2.ifc | 2 | 2 | 2 of 2 | 0 | - | 0 | - | 0 |
| FM_ARC_DigitalHub.ifc | 156 | 0 | - | 156 | - | 0 | - | 0 |
| ISSUE_005_haus.ifc | 46 | 1 | 1 of 1 | 45 | - | 0 | - | 0 |
| ISSUE_021_Mini Project.ifc | 2203 | 2203 | 2138 of 2203 | 0 | - | 177 | 174 of 177 | 0 |
| ISSUE_034_HouseZ.ifc | 19 | 0 | - | 19 | - | 0 | - | 0 |
| ISSUE_068_ARK_NUS_skolebygg.ifc | 925 | 727 | 39 of 727 | 198 | 603 | 1 | - | 1 |
| ISSUE_098_R8_F1_MAB_AR_M3_XX_XXX_MO_7000.ifc | 1209 | 0 | - | 1209 | - | 0 | - | 0 |
| ISSUE_102_M3D-CON-CD.ifc | 342 | 342 | 202 of 342 | 0 | - | 56 | 56 of 56 | 0 |
| ISSUE_102_M3D-CON.ifc | 31 | 31 | 16 of 31 | 0 | - | 0 | - | 0 |
| ISSUE_126_model.ifc | 14 | 0 | - | 14 | - | 1 | - | 1 |
| ISSUE_129_N1540_17_EXE_MOD_448200_02_09_11SMC_IGC_V17.ifc | 419 | 0 | - | 417 | - | 0 | - | 0 |
| IfcOpenHouse_IFC4.ifc | 20 | 0 | - | 20 | - | 0 | - | 0 |
| Office_A_20110811.ifc | 8 | 0 | - | 8 | - | 0 | - | 0 |
| S_Office_Integrated Design Archi.ifc | 306 | 0 | - | 306 | - | 306 | - | 306 |
| advanced_model.ifc | 1585 | 0 | - | 1585 | - | 0 | - | 0 |
| dental_clinic.ifc | 534 | 0 | - | 534 | - | 0 | - | 0 |
| duplex.ifc | 12 | 0 | - | 12 | - | 8 | - | 8 |
| example.ifc | 85 | 0 | - | 85 | - | 73 | - | 73 |
| ifcbridge-model01.ifc | 15 | 0 | - | 13 | - | 0 | - | 0 |
| schependomlaan.ifc | 206 | 127 | 105 of 127 | 79 | - | 120 | - | 120 |
| tested_sample_project.ifc | 31 | 0 | - | 31 | - | 0 | - | 0 |
| construction.ifc | 257 | 257 | 257 of 257 | 0 | - | 0 | - | 0 |
| architect.ifc | 1450 | 1392 | 1392 of 1392 | 58 | - | 0 | - | 0 |
| Schultz_Residence.ifc | 114 | 0 | - | 114 | - | 3 | - | 3 |

**Totals:** 10,035 members in 25 models.

- **Lengths that were 0.** 4,952 members store no Length, so the BoQ summed
  0 m for them. 4,948 now get a length from their body. The other 4 have
  no axis to read (2 in ISSUE_129 and 2 in ifcbridge-model01).
- **Stored against body.** 4,153 of 5,083 stored Lengths agree within 2%.
  HHS construction and architect agree on all 1,649 of theirs, and Mini
  Project on 2,138 of 2,203.
- **Host-figure lengths, a new cause.** 603 ARK_NUS_skolebygg mullions each
  store their curtain wall's length (20.858 m on every mullion of one
  facade), and their bodies are 0.4 to 3.5 m. `checkLengths` names the
  cause when one stored Length sits on 3 or more members of the same
  assembly whose bodies differ in length and are all shorter. Those 603
  stored 5,479.9 m against 794.6 m of actual mullion. Until now the BoQ
  summed the 5,479.9 m, 6.9 times too much. It now sums the body figure.
- **Unexplained.** 327 length pairs: 140 in M3D-CON-CD and 15 in M3D-CON
  (Tekla diagonal braces "DIA-*", with the body 3 to 15% off the stored
  reference length either way), 85 in ARK_NUS (stored 0.55 m against bodies
  of 0.45 and 1.25 m, a figure shared by members that are not all shorter),
  65 in Mini Project (embedded parts, stored 0.132 m against 0.060 m) and 22
  in schependomlaan. All 327 keep their stored figure.
- **Steel density.** Where a steel member stores a weight, volume x 7,850
  agrees within 2% for 230 of 233: Mini Project 174 of 177 (the 3 are
  Tekla simplified-section beams 2 to 3% heavy, already scaled by
  `weightScale`) and M3D-CON-CD 56 of 56. Before the exclusions were added,
  Mini Project's "STEEL/NEOPRENE" bearing pads (stored weight 0) also
  matched. They are excluded now.
- **Weights that were 0.** 512 steel members store no weight and now get one:
  306 in S_Office_Integrated ("Steel - Structural"), 120 in schependomlaan,
  73 in example, 8 in duplex, 3 in Schultz_Residence, and 1 each in ARK_NUS
  and ISSUE_126. The first schependomlaan run found 114. "05
  Staal_bordes_hoeklijnen" was missed because the underscore joined the
  words. `isSteel` now reads underscores as spaces, and the rerun found 120.

## What the page and CSV say

The BoQ notes column says "N lengths computed", "N weights from steel
density", "N no length" and "N no weight" (members only). The BoQ CSV has the
same four counts as columns after Amount. The element CSV adds "Computed
length m", "Length check" (agrees / differs x% (host-figure)), "BoQ length m",
"BoQ weight kg" and "Weight from".

## Limits

- 7,850 kg/m3 is plain carbon steel. Stainless (7,900 to 8,000) is left
  unweighted on purpose rather than guessed.
- The weight is the body's, so bolts, welds and coatings are not in it.
  Neither are the "plus 2 to 5% for connections" allowances estimators add.
- A material name that says nothing about steel ("RAL 9004", a paint colour
  on 829 ARK_NUS members) is not weighted, even when the member is steel.
