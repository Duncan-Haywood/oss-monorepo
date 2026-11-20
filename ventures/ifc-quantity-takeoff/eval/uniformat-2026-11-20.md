# Uniformat II elements from IFC models, 17 public models, 2026-11-20

**Question.** An estimator prices a building by element (foundations,
exterior walls, partitions, plumbing fixtures), and the elemental estimate
most US cost plans use is arranged by UNIFORMAT II. An IFC model is arranged
by class. How much of a real model can be put into Uniformat II elements from
what the model says about itself, and where an author set the code by hand,
how often does the rule land on the same one?

**Codes.** Levels 1 to 3 of NISTIR 6389 (Charette and Marshall, NIST, 1999,
a US government work; ASTM E1557 publishes the same levels), in
`uniformat.mjs`.

**Data.** Blob-less sparse clones of `opensourceBIM/IFC-files` (HHS Office
architect, construction and MEP; OpeningDesign Schultz_Residence) and
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (dental_clinic, duplex,
AC20-FZK-Haus, C20-Institute-Var-2, kleine_Wohnung_R22, schependomlaan,
FM_ARC_DigitalHub, Mini Project, HouseZ, advanced_model, S_Office_Integrated
Design Archi, ARK_NUS_skolebygg, Office_A). Not committed.

**Method.** `node eval/uniformat-check.mjs <17 files> --json eval/uniformat-check-2026-11-20.json`
(output: `uniformat-check-2026-11-20.txt`). Each element that is not an
assembly of other elements (as in the BoQ) gets:

- the model's own code when it has one: a classification reference or an
  `Assembly Code` property whose text starts with a code in the table (Revit
  writes `B2020100` under `http://www.csiorg.net/uniformat`; cut to `B2020`).
  Text that is not in the table is ignored: ARK_NUS's "Default
  Classification" holds fire ratings like `E30`, schependomlaan's holds
  NL/SfB `21.12`.
- otherwise the rule's code: the class (the type object's class for IFC2X3's
  generic `IfcFlowTerminal` and the like) read with PredefinedType, IsExternal,
  the wall a door or window fills, the assembly it is part of, the storey's
  elevation, and for a few generic classes the family name. A rule that
  cannot tell level 3 stops at level 2 or 1 (`B10` for a beam that may carry a
  floor or the roof, `D` for pipework whose system is not read), or gives no
  code with the reason.

The rule's code is kept for every element, so where the author set a code the
two can be compared.

**How the rules were written.** First pass, before looking at any author's
code: on Schultz_Residence, ARK_NUS and Office_A plus dental_clinic, the rules
agreed with the author's code on 15 of 166 comparable elements at level 3 and
52 at level 1. Two causes accounted for most of it:

1. Schultz_Residence (Revit, IFC2X3) flags all 25 windows `IsExternal =
   false`, and the walls they fill too, while the author's Assembly Code puts
   them in B2020 Exterior Windows. Windows are now exterior unless they sit in
   a roof (B3020); IsExternal on a window is not trusted.
2. Toilet accessories (grab bars, towel dispensers, mirrors) are exported as
   `IfcSanitaryTerminal`, which the class rule put in D2010 Plumbing Fixtures;
   their authors put them in C1030 Fittings, as NISTIR 6389 does. Generic
   flow terminals and proxies with no type class (ARK_NUS's WCs and washbasins)
   had no rule. A short list of family-name words now handles both, only for
   those generic classes.

These were tuned on Schultz_Residence, ARK_NUS and Office_A. dental_clinic was
held out until the rules were fixed; it is another Revit sample in the same
family as Office_A, so it is a weak hold-out.

**Results.**

| | elements |
|---|---|
| elements (17 models, assemblies left out) | 33,893 |
| code from the model | 588 |
| code from the rules | 28,086 |
| no code | 5,219 |
| at level 3 / 2 / 1 | 19,417 / 7,230 / 2,027 |

Where the author set a code (588 elements in 7 models), the rules were silent
on 31 (ARK_NUS proxies with no telling name) and agreed:

| | level 1 | level 2 | level 3 |
|---|---|---|---|
| all 7 models | 525 | 523 | 482 |
| dental_clinic (held out), 69 coded | 66 | 66 | 66 |
| HHS MEP, 131 coded | 131 | 131 | 131 |
| advanced_model, 135 coded | 135 | 135 | 131 |

What is left where they differ (each a judgement the author made, or one the
rule cannot see):

- 26 ARK_NUS lockers: author E1090 Other Equipment, rule C1030 Fittings
  (NISTIR 6389 lists lockers under C1030; the author departed from it).
- 12 Schultz_Residence cabinets named by catalogue number (`255_9255:33"`):
  author E2010 Fixed Furnishings, rule E2020 Movable. Nothing in the file
  tells casework from furniture.
- 3 dental_clinic ADA shower seats exported as sanitary terminals: author
  E1020 Institutional Equipment, rule D2010 (by class).
- 2 kleine_Wohnung roof windows hosted by a wall or by nothing and not named
  as skylights: author B3020, rule B2020.

Where no code was given (5,219), the largest causes are
`IfcBuildingElementProxy` with no telling name (3,153; 1,711 of them in
S_Office_Integrated Design Archi), building element parts the rules could not
place (705), `IfcDiscreteAccessory` in the Tekla Mini Project (409), railings
that are not part of a stair (486), walls with no IsExternal (274: the two
ArchiCAD IFC4 exports and HouseZ) and insulation coverings (99).

**Limitations.** Comparable elements are few (588) and concentrated in
Revit exports, where the Assembly Code mostly sits on furniture, fixtures and
windows: walls, slabs and frames, which carry most of the money, have no
author's code in any of the 17 models, so the wall and slab rules are checked
only against the sample and the IFC definitions, not against an estimator.
IsExternal is trusted on walls and doors although Schultz_Residence shows an
exporter can get it wrong; an envelope test from the geometry (is the wall on
the building's outside?) would not need it.

**Next.** Envelope from geometry for walls with no or doubtful IsExternal;
frame members split into B1010 and B1020 by what they carry (the slab or roof
they meet); pipes and ducts to a system through `IfcRelAssignsToGroup`
(plumbing, heating, sprinkler); a real estimator's reading of the grouped BoQ.
