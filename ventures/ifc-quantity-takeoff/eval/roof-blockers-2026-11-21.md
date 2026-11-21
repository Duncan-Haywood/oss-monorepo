# Roofs as blockers in the envelope test: knee walls, 17 public models, 2026-11-21

**Question.** The envelope test (`envelope.mjs`, eval/envelope-2026-11-20.md)
decides whether a wall is on the building's outside by casting horizontal
rays from its faces: a ray that crosses no wall, curtain wall or upright
facade piece has left the building. Roofs did not stop rays, so a knee wall
in an attic (a short wall a metre or two in from the eaves, with the roof
coming down behind it) read exterior: schependomlaan's `knieschot` walls were
the example named in that write-up. Can sloped roofs block rays without
turning real exterior walls into partitions?

**Data.** The same 17 models as eval/envelope-2026-11-20.md (sparse clones of
`opensourceBIM/IFC-files` and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/`; not committed).

**Method** (`envelope.mjs`, `roofFaces`, `roofCut`, `isRoofPiece`).

1. Roof pieces: an IfcRoof with its own body, a slab with PredefinedType
   ROOF, a covering with ROOFING, any element that is a part of an IfcRoof,
   and a slab, plate or covering whose name or type says roof (roof, dak,
   Dach, tak, toit, techo, cubierta, tetto). A piece is kept only if it rises
   0.5 m or more: a flat roof never crosses a wall's ray height.
2. At the height a wall's rays are cast (the lower of 1.2 m above its foot and
   half its height), each roof piece's faces are cut by that level into plan
   segments. Faces standing upright (the roof's edges) are left out; each kept
   segment remembers which way its face rises.
3. A ray that crosses no wall is still closed by a roof when three things hold:
   - the first roof face it meets comes **down** across it (its height falls
     along the ray, so the ray is under the roof; a ray that meets a roof
     rising ahead of it is above that roof, outside);
   - beyond the roof's cut, less 0.5 m, the ray crosses in plan a **lower
     wall** (top below the ray height and within 3.5 m of it): the eaves wall
     the roof comes down onto. Without one, a roof hit is an eaves overhang
     outside an exterior wall, and the ray still leaves;
   - that lower wall is more than 0.1 m away (not the wall this one stands on,
     which the ray starts inside).
4. A wall the roof closes is read again 0.5 m below its top (a quarter of its
   height for short walls, only when that is 0.3 m or more above the first
   height). If it is open there, it rises through the roof (a dormer's front
   or cheek) and stays exterior; the row carries `aboveRoof`. A wall closed
   only by a roof carries `underRoof`.

Each rule came from a model. The first version had only (1), (2) and the
lower-wall test with no minimum distance: eaves walls read their own
foundation wall as the "lower wall beyond" and turned interior, which the
synthetic attic test caught. The top re-read (4) came from six schependomlaan
`HSB-element` walls; it did not rescue them (below) but did keep three HouseZ
walls on its "Roof" storey exterior. The face-direction rule in (3) came from
looking at four 0.2 m `buitenblad` pieces on schependomlaan's roof storey,
whose rays met a roof rising toward its ridge. On the real file it moved
nothing: the four still read interior, since their ray height lies inside the
roof's build-up (below). It is kept because without it a wall standing on a
roof, between two roofs rising on either side, would read interior (the
valley test in envelope.test.mjs fails without the rule).

**Run.** `node eval/roof-blockers.mjs <17 files> --json eval/roof-blockers-2026-11-21.json --list 200`
(output `roof-blockers-2026-11-21.txt`; each model is taken off twice, with
and without roofs; about 5 minutes), then
`node eval/envelope-check.mjs schependomlaan.ifc ISSUE_034_HouseZ.ifc` for the
flag agreement.

## Result

15 of the 17 models have no sloped roof over a wall's ray height, or no walls
(the HHS MEP and Mini Project models), and nothing in them moves. In the other
two, 67 of 4,832 walls move, all from exterior to interior:

| model | moved | flag interior (now agrees) | flag exterior (now disagrees) | no flag |
|---|---|---|---|---|
| schependomlaan | 66 | 52 | 14 | 0 |
| HouseZ | 1 | 0 | 0 | 1 |

schependomlaan, by type name:

- 22 `knieschot` (knee walls, `IFC_knieschot_ongeisoleerd`, 0.45 to 0.92 m
  high, third floor): the case the test was built for. All now agree with
  their interior flag.
- 23 `separatiewand`, 5 `binnenwand` (partitions) and 2 `liftwand` flagged
  interior, mostly on the third floor under the roof, five on the first floor
  under the low roof of a lower wing: rays that used to leave through the
  attic now meet the roof's underside with the eaves wall beyond.
- 14 flagged exterior now read interior. Six `HSB-element` walls
  (`IFC_HSB_155_wandelement_Rc=3,67`, insulated timber-frame panels, 2.69 m
  high): at their tops the roof's underside is still 0.46 m further out
  (checked by casting the rays by hand), so they stand wholly under the roof.
  They are insulated walls between heated rooms and the cold space under the
  roof, so on a thermal reading they are part of the envelope; on the
  geometry they are inside the roof. Two `kozijn` (window frames modelled as
  walls) on the same storey are the same case. Four 0.2 m `buitenblad`
  (`IFC_cellenbeton_100mm`) and two `liftwand` pieces on the roof storey have
  their ray height inside the roof's build-up, and read interior. The flag
  is kept for all 14 (the test only overrules a flag a model gives every
  wall alike), so their Uniformat code stays B2010 and each row says the
  geometry disagrees.

HouseZ (no flags): of four walls on its "Roof" storey that the roofs first
closed, three rise above the roof at their tops and stay exterior; one, #46666,
a 1 m upstand at the edge of a roof, moves from B2010 to C1010. Its plan does
not settle which side of the envelope it is on; it is not judged here.

Flag agreement, schependomlaan:

| | before | after |
|---|---|---|
| flag and geometry agree | 815 of 922 | 853 of 922 |
| flag interior, read exterior | 53 | 1 |
| flag exterior, read interior | 54 | 68 |

Across the 17 models flag and geometry now agree on 3,572 of 4,564 walls
(3,534 before). In the Uniformat grouping one wall changes code (HouseZ
#46666); the other 66 carry flags, which are kept. What changes for an
estimator is the "check it" note: 52 wrong ones gone, 14 new ones, all 14 on
walls whose place in the envelope a person would argue about.

**Limitations.** One building with sloped roofs over walls (schependomlaan)
carries almost all of the result; FZK-Haus's sloped roof sits on its walls and
moves nothing. Nobody who prices buildings has checked the placements. Roof
pieces are found by class, PredefinedType, assembly and name; a sloped roof
modelled as an untyped slab with no roof word in its name is not a blocker. A
roof whose geometry is not read (kleine_Wohnung's NURBS zinc roof) blocks
nothing. A knee wall with no lower wall beyond its roof (an attic whose eaves
walls are not modelled) still reads exterior.

**Next.** A person who prices buildings choosing where an insulated wall
against a cold roof space belongs (B2010 or C1010); the same roof cuts for
railings (a guard round an attic stair well); a second model with knee walls.
