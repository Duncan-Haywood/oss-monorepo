# A body's items are one solid: overlaps counted once (2026-11-21)

**Question.** After the 3D view landed (eval/model-view-2026-11-21.md), 130
of 9,314 elements' drawn boundaries enclosed a different volume from the one
the takeoff computed: 126 on ARK_NUS_skolebygg (furnishings at 56% of the
computed volume), a Tekla beam 11.8% over, an IfcOpenHouse door 1.4% under.
Was the picture wrong, or the number?

**Answer: mostly the number.** Four causes, three of them fixed here.

1. **Overlapping items summed (the takeoff's error; 128 elements).** An IFC
   shape representation can hold several items, and the takeoff added their
   volumes. Where items run into each other, the shared part was counted
   twice. A Monte Carlo count over the terms (400,000 points per element) on
   three ARK_NUS cabinets found points held by two items and none by three.
   The union of the items came out at the drawn volume (0.19431 vs 0.19436
   m3, 0.76756 vs 0.76780, 0.63977 vs 0.63982), and the plain sum at the
   old computed one. A Revit kitchen cabinet "Høyskap, kjøkken
   600 x 600 x 2100mm" was taken off at 1.368 m3, 1.8 times the 0.756 m3 of
   a 600 x 600 x 2100 box. Its carcass, shelves and door are separate
   extrusions that overlap. The IfcOpenHouse door's 860 mm leaf runs 10 mm
   into each 80 mm post: 2 x 10 x 30 x 2120 mm3 = 1.27 L counted twice,
   88.23 L reported against 86.96 L of material.

   Fix (`geom.mjs`, `representation`, `unionTerms`): each item is joined to
   the items before it as A + B - (A n B). The intersection is the pairwise
   clip of their convex terms, signs multiplied. That is exact while each item
   is a solid (its terms sum to 0 or 1 everywhere), and the same rule the
   takeoff already used for IfcBooleanResult UNION. Pairs whose boxes do not
   share a volume are skipped, and so are intersections of no volume (items
   that only touch). An item whose overlap would take more than 4,000
   pieces keeps the plain sum, and the element carries a note saying so (2
   on ARK_NUS). Faceted items are not joined; the shells' own note already
   says their pieces may overlap.

2. **A cut 5 micrometres off the face it trims (the view's error; 1 element).**
   Tekla beam #1717 (Mini Project) has a notch and a bottom cut at its end.
   The exporter's clip left the cut's end plane at x = 0.000005 mm, and the
   view's mesher tested box overlap and "lies wholly outside" against a
   tolerance of 1e-10 of the element's size (0.9 nm here). So the cut never
   split the beam's end face, and the face was drawn whole: 126,000 mm2
   instead of 70,000. Fix (`view-mesh.mjs`): both tests use the 1e-8 offset
   the in/out probe already used (86 nm). #1717 now encloses 1.344549 m3
   against 1.344549 computed.

3. **A piece a hair open, far from the origin (the takeoff's error, found
   while checking 1).** ARK_NUS railing #1596214 ("Glassfelt - h=1000 bro")
   came out larger after the union (0.503 to 0.598 m3), which a union of
   solids cannot do. Some of its convex pieces are open by about 1e-4 of
   their face area, a clip's rounding. `polyVolume` took the divergence
   theorem about the model's origin, and this site lies about 230 m from it.
   There a gap of 1e-4 is worth millions of mm3 (one piece: -7.6e6 mm3
   about the origin, 1,646 about its own vertex). Fix (`geom.mjs`,
   `polyVolume`): taken about the piece's first vertex. That is the same
   value for a closed piece, and a bounded error for one a hair open. The railing
   is now 0.49314 m3 against 0.49315 by Monte Carlo. Its old 0.503 was also
   2% high. On its own, before the union, this changes 6 of 14,966
   volumes (Mini Project's KOLOM columns, 0.023601 to 0.023546 m3; Monte
   Carlo 0.02355; `item-union-2026-11-21-polyvolume.txt`). `shellVolume`
   (faceted shells) still sums about the origin: next to check.

4. **Left: two Tekla beams at 0.51% and 0.53%,** just past the 0.5% line
   (#32178, #32308, Mini Project). Not traced.

**Check, 11 public models** (the same set as the model-view eval: the sample,
sparse clones of `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` and
`opensourceBIM/IFC-files` `HHS Office/`).

| | Before | After |
|---|---:|---:|
| Elements whose drawn boundary encloses the computed volume (0.5%) | 9,184 of 9,314 | **9,310 of 9,312** |
| Elements drawn as their box | 437 | 439 |
| Computed volumes changed by the union | | 197 (196 on ARK_NUS, 1 IfcOpenHouse door) |
| ARK_NUS: those 196 elements' total | 43.19 m3 | 35.37 m3 |
| Changed by `polyVolume` about the piece | | 6 (Mini Project columns, -0.2%) |
| Stored vs computed report (`stored-vs-computed.mjs`, every model) | | unchanged, line for line |

ARK_NUS by class (`item-union-2026-11-21.txt`): furnishings 55 elements,
16.13 to 9.21 m3 (-42.9%); windows 56, 11.71 to 11.22 (-4.1%); building
element proxies 34, 12.09 to 11.71 (-3.1%); flow terminals 25 (-3.7%); doors
22 (-0.8%); railings 4, 1.009 to 0.989 (-2.0%; see 3).
The 9,312 checked (2 fewer) and 439 boxes (2 more) are two ARK_NUS elements
whose joined body passed the view's 250-piece budget and is now drawn as
its box. Their quantities are unaffected.

The stored-vs-computed report is the same line for line: its agreement counts
and every listed disagreement are unchanged. On the other ten models the
union found nothing to join apart from the one door.

**Files.** `item-union.mjs` (before/after per element; run with a copy of
the venture from before the change), `item-union-2026-11-21.txt/.json` (union alone: the before copy has the new
`polyVolume`),
`model-view-2026-11-21-union.txt/.json`. Tests: `engine.test.mjs` "a body's
overlapping items are joined", `view-mesh.test.mjs` "a cut whose end lies a
few micrometres off the face it trims".
