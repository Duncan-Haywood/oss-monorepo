# Slabs on grade, gutters, downspouts and outside railings, 17 public models, 2026-11-20

**Question.** After `slab-roles-2026-11-20.md`, three groups were still filed
where an elemental estimate would not price them:

1. ground-floor slabs poured on the ground in a building with no basement:
   B1010 Floor Construction, where UNIFORMAT II has A1030 Slab on Grade (only
   BASESLAB slabs and slabs on a storey below grade reached A1030);
2. gutters, downpipes and the framing of a box gutter: generic pipework (`D`,
   level 1) or B1010 floor slabs, where NISTIR 6389 lists gutters and
   downspouts under B3010 Roof Coverings;
3. railings outside the building (balcony and roof guards): no code at all.

How many elements of the 17 models are in each group, and can the name or the
geometry tell?

**Data.** The 17 models of `uniformat-2026-11-20.md` (blob-less sparse clones
of `opensourceBIM/IFC-files` and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public`, not committed). `node eval/uniformat-check.mjs <17
files> --geometry --json eval/uniformat-check-2026-11-20-grade.json`, output
in `uniformat-check-2026-11-20-grade.txt` (the run before this change is
`uniformat-check-2026-11-20-slabs.txt`). Every element's code before and after
came from a scratch script run on both versions of the code;
`slab-on-grade-2026-11-20-changes.txt` lists each changed group.

**How it was looked at.** Two listings, read by eye: every slab whose bottom
is within 1.5 m of the lowest slab or wall in its model, with what lies under
it (slabs, beams, columns, walls stopping at its underside) and over it; and
every element whose type or name holds a word for gutter, downpipe, parapet,
grade, ground, foundation, terrace or balcony in English, German, Dutch or
Norwegian, plus every railing with its IsExternal flag. No author codes any of
these elements in the 17 models, so there is no held-out check; the rules are
written from these listings and every change is below.

## Rules (`uniformat.mjs`)

**Slab on grade by name** (`slabRole`): "slab on grade", "on grade", "ground
slab", "ground bearing slab", Bodenplatte, Fundamentplatte, Sohlplatte,
grondplaat, terrengdekke: A1030. If the name also says it is outside
(exterior, external, patio, terrace, terras, walkway), or the geometry finds
no slab or roof over it (below), it is a patio or walk: G2030 Pedestrian
Paving.

**Slab on grade by geometry** (`findGroundSlabs`), for slabs typed FLOOR or
with no PredefinedType whose name says nothing else:

- its bottom is within 0.5 m of the lowest slab or wall bottom in the model.
  Walls count, so a floor over a crawl space, whose walls go down past it, is
  not at the bottom;
- no slab or roof lies under the middle of its plan;
- no beam or column stops at its underside (from 0.6 m below to 0.4 m above
  its bottom). Walls are not counted, since a house's slab on grade often sits
  on its stem walls;
- at least 2 m² of plan, not part of an assembly, not on a storey below grade
  (already A1030).

It is G2030 instead when no slab or roof covers the middle of its plan from
above while some other slab or roof in the model is higher, and only when
every roof's geometry was read. A model of one slab says nothing about outside
(the tool's own sample office: its one slab is A1030, not paving).

**Gutters and downspouts** (`rainwaterRole`): a pipe segment or fitting with
PredefinedType GUTTER, or named gutter, goot, dakgoot, Dachrinne, takrenne,
downspout, downpipe, rainwater pipe, leader, Fallrohr, regenpijp, hwa
(hemelwaterafvoer), nedløp: B3010. A slab named as a gutter or its framing
(gootconstructie): B3010.

**Railings flagged IsExternal**: B2010. ASTM E1557's level 4 puts balcony
walls and handrails under B2010 Exterior Walls (B2015) and parapets there too
(B2012); NISTIR 6389's PDF did not answer through this session's proxy, so the
level-4 numbers are from the standard as known, not re-read today. A railing
flagged not external is still not coded: Revit writes false on every railing
(Schultz_Residence's 253, FM_ARC's 13), so the flag false says nothing.

The flagship row's note "parapets as B3010" was wrong by that list: a parapet
is part of the exterior wall (B2012), and a parapet modelled as a wall already
gets B2010 from IsExternal or the envelope test. None of the 17 models names
one.

## Results

164 element codes changed in 6 models; the 588 authors' codes match as before
(525 / 523 / 482 at levels 1 / 2 / 3). Level 3 coverage 22,545 to 22,685,
uncoded 4,951 to 4,874, level-1-only 2,027 to 1,964.

| change | elements | where |
|---|---|---|
| B1010 to A1030 Slab on Grade | 10 | advanced_model and HHS construction (the 3,518 m² "STB 30.0" ground slab each), duplex 2 by name ("127mm Slab on Grade"), HouseZ 5, kleine_Wohnung 1 |
| B1010 to G2030 Pedestrian Paving | 2 | duplex's "150mm Exterior Slab on Grade" (25 m² each, nothing over them) |
| D (pipework) to B3010 Roof Coverings | 63 | schependomlaan's 60 zinc "hwa afvoer" downpipes; ARK_NUS's 3 "Takrenne" gutters (PredefinedType GUTTER) |
| B1010 to B3010 | 12 | schependomlaan's "gootconstructie" (box-gutter framing) slabs |
| none to B2010 Exterior Walls | 77 | schependomlaan's railings flagged IsExternal (steel balustrades, landing angles, glass guards) |

**Read by eye, and what the geometry rule passed over.**

- schependomlaan's ground floor (the 445 m² cast deck "IFC_betonvloer_ihw"
  and 40 hollow-core "kanaalplaat" pieces, 1.26 m above the bottom of the
  model) rests on 4 to 72 foundation beams each: suspended, kept B1010, as a
  Dutch ground floor over a crawl space is. Its lift-pit floor was already
  A1030 (storey below grade).
- HouseZ (IFC2X3, no names, every slab on the storey "Site"): the five
  lowest slabs (11 to 133 m², within 0.29 m of the bottom) moved to A1030; the
  205 m² slab at 0.68 m with 8 walls under it and three 5 to 40 m² slabs at
  0.80 m stay B1010. Whether that 205 m² slab is a slab on grade or a floor
  over a crawl space the file does not say; this is the least certain call
  here.
- kleine_Wohnung's 6 m² "STB 20.0" at the very bottom (1.5 m under the
  storey's other slabs, nothing under it): A1030, a pit floor. Its 316 m²
  "STB 20.0" on the same storey has 4 walls stopping under it and is 1.5 m up:
  kept B1010.
- Mini Project's "TRIMEX" plates at the bottom are under 2 m² each: kept.
- No frame member changed: none bears on a slab that moved.

**What it got wrong or left.**

- The rainwater words are the ones these models use. A downpipe inside the
  building (an internal roof drain) is D2040 Rain Water Drainage, not B3010;
  the name does not tell them apart, so an internal "hwa" would be misfiled.
  schependomlaan's are zinc, which is outside work.
- A slab on grade in a building whose lowest walls are its foundation walls
  going down past the slab (duplex) is not found by the geometry; duplex's
  are found by name.
- Railings flagged false or not flagged stay uncoded (409 in 13 models);
  their geometry
  (on a balcony slab, at a roof edge, beside a stair) is the next way in.

**Next.** Railings placed by what they stand on (a balcony slab outside the
envelope, a roof edge, a stair flight's side); downpipes inside or outside the
envelope test's walls (B3010 or D2040); a first check of the slab-on-grade
rule against a model whose author codes its ground slab.
