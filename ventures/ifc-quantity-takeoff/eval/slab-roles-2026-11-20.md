# Slabs that are roofs, finishes or sun shades, 17 public models, 2026-11-20

**Question.** The Uniformat II rules (`uniformat.mjs`) put every `IfcSlab`
typed FLOOR, or with no PredefinedType, in B1010 Floor Construction. Revit
and ArchiCAD users model a lot of other things with the floor tool: the flat
roof of a building, the finish laid on a floor (carpet, tiles, screed, each
as its own thin floor), stair tiles and sun-shade fins. An elemental estimate
prices those as roof construction, floor finishes, stair finishes and exterior
enclosure, and the frame under a roof slab as roof construction. How many of
the 600 B1010 slabs in the 17 models are something else, and can the type
name or the geometry tell?

**Data.** The 17 models of `uniformat-2026-11-20.md` (blob-less sparse clones
of `opensourceBIM/IFC-files` and `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public`, not committed). `node eval/uniformat-check.mjs <17
files> --geometry --json eval/uniformat-check-2026-11-20-slabs.json`, output
in `uniformat-check-2026-11-20-slabs.txt`; the run before this change is
`uniformat-check-2026-11-20-frames.txt`. The per-slab listing below came from
a scratch script that printed each B1010 slab's type name, storey, box, the
decks over and under it, and the walls under and on it.

**How it was looked at.** Every slab type name in the 17 models was listed
by PredefinedType, code and storey, and each slab with no deck over the middle
of its plan was listed with its box. The rules below were written from those
two lists; no author codes a slab in any of these models, so there is nothing
to hold out against, and every change was read by eye (below).

**Rules** (`slabRole`, `findRoofDecks`):

1. **By type name**, for slabs typed FLOOR or with no PredefinedType
   (BASESLAB, ROOF and LANDING are already told):
   - floor finish, C3020: `FB <n>` (Fussbodenbelag, the German Revit
     template's finish floors), "Finish Floor", Fliesen, Teppich, Parkett,
     (Holz)dielen, carpet, rug, tile, (vloer)tegels, dekvloer (screed), Estrich,
     linoleum, vinyl, flis; on a stair (trapp, treppe, stair), C2020 Stair
     Finishes. A name that also names the structure (betong, beton, concrete,
     STB, structural, joist, hollow core) stays the floor: ARK_NUS's
     "Betongdekke 300 + avretting og flis" is a concrete deck naming its
     topping.
   - sun shade, B2010 (exterior sun control, as `IfcShadingDevice` is):
     Sonnenschutz, sun shade, brise soleil, zonwering.
   - roof, B1020: roof, dak, dakvloer, plat dak, Dach, Flachdach, tak, toit,
     techo, cubierta, tetto, as whole words.
2. **By geometry**, for the rest when the geometry was read: a slab is the
   roof when no slab or roof lies over the middle of its plan, at least one
   wall or column stops at its underside (so it is carried, not a fin or a
   slab on the ground), no wall stands on it rising more than 1.5 m (no
   storey's walls; a parapet is lower), it is more than 2 m above the lowest
   slab or wall in the model and covers at least 2 m² of plan. Nothing is
   decided by geometry in a model with a roof whose geometry was not read,
   since that roof may be the one over the slab (kleine_Wohnung's zinc roof).

The frame rule (`frames-2026-11-20.md`) reads the new slab codes, so a beam
or column under a roof slab moves to B1020 with it, and one under a finish
slab bears on the structural slab under it or on nothing.

**Results.** 474 element codes changed in 17 models; the 588 authors' codes
match as before (525 / 523 / 482 at levels 1 / 2 / 3).

| slabs (17 models) | before | after |
|---|---|---|
| B1010 Floor Construction | 600 | 270 |
| B1020 Roof Construction | 117 | 135 |
| C3020 Floor Finishes | 0 | 252 |
| C2020 Stair Finishes | 0 | 25 |
| B2010 Exterior Walls (sun shades) | 0 | 36 |
| A1030 Slab on Grade | 15 | 14 |
| C2010 Stair Construction (landings) | 36 | 36 |

| frame members | before | after |
|---|---|---|
| columns B1010 / B1020 | 529 / 54 | 415 / 168 |
| beams B1010 / B1020 | 275 / 71 | 246 / 99 |

Roof slabs found, by model:

- by name: schependomlaan's six "IFC_plat_dak_geisoleerd" (insulated flat
  roofs on the second floor, the "plat dak" the frames note named as a known
  miss), the "dakvloer" (roof floor, 152 m²) and the eight 60 mm precast
  shells under it on "04 dak". With them 20 beams under those roofs moved to
  B1020 (15 steel, 4 HEA, 1 lintel).
- by geometry: the 3,537 m² "STB 30.0" deck on "Roof Level" in HHS Office's
  construction model and in advanced_model (41 columns each on Level 3 now
  B1020), and FM_ARC_DigitalHub's 1,255 m² "STB 250" on E01 under its green
  roof build-up (8 beams, 32 columns to B1020). Each has 12 to 63 walls or
  columns under it and nothing standing on it.

Finishes: 252 slabs in seven models (251 of them from B1010, one basement build-up from A1030) (advanced_model and architect 57 each,
schependomlaan 79 screeds and tiles, kleine_Wohnung 36, duplex 14,
FM_ARC 7, Schultz's 2 rugs), plus ARK_NUS's 25 stair tiles to C2020.

**Read by eye, and what the geometry rule passed over.** The B1010 slabs
with no deck over their middle, other than the three roof decks above:

- architect's finish floors on Levels 1 to 3 (HHS's architect model has no
  structure, so its finishes are the top decks), and its 6 Sonnenschutz fins
  on Roof Level: told by name before the geometry rule is reached. Most of
  the finishes also have walls standing on them, and the fins have no wall
  under them, so the geometry rule would have kept them out as well.
- kleine_Wohnung's four "STB 20.0" slabs on OG02 under an attic: kept, since
  the roof's geometry is not read (8 breps on NURBS surfaces), and walls
  stand on them.
- ARK_NUS's two "Betongdekke 250 m fall" (a falling deck, 46 and 80 m²)
  carry 4 and 6 walls: kept as floors. They may be terraces; the name does not
  say.
- Schultz_Residence's "Garage Slab" on the storey "Roof" (37 m², 5 walls on
  it): kept.
- duplex's two "150mm Exterior Slab on Grade": on the lowest level, kept.
  Its name says slab on grade (A1030 or a G20 terrace); no rule reads that yet.
- ARK_NUS's three "Fotskraperist" (foot-scraper grates, 30 mm) and
  schependomlaan's gutter framing ("gootconstructie", 13 slabs) and two EPS
  insulation pieces: kept (no wall under, or walls on them).

**What it got wrong or left.**

- One ARK_NUS IPE 200 beam carried a stair tile slab and now carries nothing,
  so it went from B1010 to B10 (level 3 coverage 22,546 to 22,545).
- schependomlaan's "lifttop" (the lift shaft's roof slab, 5.8 m²) stays B1010:
  the shaft's walls rise past it.
- "Geschossdecke:FB 100 leer" (FM_ARC, basement) is a floor build-up
  placeholder; it moved from A1030 to C3020 with the other FB finishes.
- The name lists are the words these 17 models use. A model in another
  language, or a template that names a finish by its thickness alone, falls
  through to the geometry and the class.

**Next.** Read "slab on grade" in a FLOOR slab's name (duplex), gutters and
parapets as B3010 roofing, and a first check of the finish rule against an
author's code, which none of these models sets on a slab.
