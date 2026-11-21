# The unexplained NetVolumes: 233 to 83, 2026-11-21

Follows [stored-vs-computed-2026-11-21.md](stored-vs-computed-2026-11-21.md),
which left 233 stored NetVolumes that disagreed with the geometry with no
named cause: 120 on Tekla's Mini Project, 90 on schependomlaan (ArchiCAD), 23
on skolebygg (Revit). Question: what are they, and which make a bill of
quantities wrong?

**Data.** The same 13 public models at the same commits
(`opensourceBIM/IFC-files` `cb96c50`, HHS Office architect and construction;
`ThatOpen/engine_web-ifc` `5ba2467`, `tests/ifcfiles/public/`), fetched with
blob-less sparse clones, not committed.

**Method.** Each unexplained row was printed with its body's representation
items, its profile entity and parameters, its aggregate and its other stored
figures, then grouped by (class, computed/stored ratio, body shape). Each
pattern below held on every element of its group before it became a rule in
`explainChecks` (`qto.mjs`, the code the page runs). Rerun: `node
eval/stored-vs-computed.mjs <13 files> --json
eval/stored-vs-computed-2026-11-21-net.json` (output in
`stored-vs-computed-2026-11-21-net.txt`).

## 1. Tekla stores steel from a simplified section (120 NetVolumes, 22 GrossVolumes)

Every one of Mini Project's 120 is a body swept from one parametric profile
(an extrusion, or one clipped by half-spaces at its ends), and the ratio
computed/stored is the same for every part of one profile whatever its
length. Each ratio is the exact section's area over a simplified one:

| Profile (IFC parameters, mm) | Parts | Computed / stored | Simplified section | Its ratio |
|---|---:|---:|---|---:|
| L65/130/8, root radius 12 | 42 | 1.0207 | no fillet: 8 x (65 + 130 - 8) = 1,496 mm2 | 1,526.9 / 1,496 = 1.0207 |
| L100/100/10 (named H100/100/10 on 22), r 15 | 24 + 20 gross | 1.0254 | no fillet: 1,900 mm2 | 1,948.3 / 1,900 = 1.0254 |
| L80/80/8, r 12 | 2 | 1.0254 | no fillet: 1,216 mm2 | 1,246.9 / 1,216 = 1.0254 |
| IPE240, r 15 (clipped ends) | 3 | 1.0520 | no fillets: 3,718.5 mm2 | 3,911.6 / 3,718.5 = 1.0519 |
| IPE300, HEA180 (clipped ends) | 4 + 1 | 1.0372, 1.0446 | no fillets | same rule, matched to 0.5% |
| round tube 60 x 1 | 22 | 1.0262 | 16-sided polygons: 180.6 mm2 | 185.35 / 180.6 = 1.0262 |
| round tube 20 x 1 | 20 | 1.1107 | 8-sided polygons: 53.74 mm2 | 59.69 / 53.74 = 1.1107 |
| square tube 60 x 3, radii 3 and 6 | 2 + 2 gross | 0.9661 | no corner radii: 684 mm2 | 660.8 / 684 = 0.9661 |

The file itself confirms which figure is the real one: the same model stores
`CrossSectionArea` 0.003911 m2 on an IPE240 accessory, the catalogue area
with the root radii, while its NetVolume is the length times 3,718.5 mm2.
The stored `NetWeight` is that NetVolume times 8,000 kg/m3, so Tekla's
weights on these parts are as low as its volumes (an IPE240 beam 8.46 m long
stores 251.5 kg; on the real section it is 264.6 kg at the same density).

Rule `simplified-section`: for a body swept from one parametric profile,
`sectionVariants` (`geom.mjs`) draws the profile again without its fillet
and edge radii, with circles as inscribed 6, 8, 12, 16 or 24-gons, and both;
when stored/computed equals one of those area ratios to 0.5% (a quarter of
the agreement tolerance, as the ratio is exact), the cause is named, the BoQ
sums the geometry, and the stored weight is scaled by computed/stored.
Arbitrary (drawn) profiles get no variants, so a drawn section can never be
explained this way. On the planted test (engine.test.mjs) a stored volume 10%
off on the same L stays unexplained.

## 2. One stair's total on every piece (23, skolebygg)

skolebygg's two "Assembled Stair" elements (IfcStair #1359409, #1361225) are
aggregates of flights, landing slabs, stringers (IfcMember) and railings. All
14 stringers of the first store NetVolume 1.34012, all 9 of the second
1.31633, though each has a different Tag and the stringers' own geometry is
0.0004 to 0.0121 m3. The figure is the stair's: flights 0.58795 + landings
0.66465 + stringers 0.08752 = 1.34012 m3 (railings left out), and 0.88841 +
0.36099 + 0.06693 = 1.31633 on the second, both to five decimals.

Rule `assembly-total`: the same stored value on two or more pieces of one
aggregate (an IfcRelAggregates parent, element or not), equal within 2% to
the sum of all the aggregate's pieces' geometry or of all but its railings;
`repeated` when it is at least 1.5 times the largest piece but matches
neither sum. It runs after the unit-slip test, so the same stringers'
GrossVolumes (stored in litres, `unit-slip`) keep that cause.

## 3. A stored 0 (7, schependomlaan)

Six skylights ("dakkoepel 1000x", IfcWindow, 0.184 m3 of geometry each) and
one fitting ("bellentableau") store NetVolume 0. Rule `not-stored`: a stored
0 on an element with a body is a placeholder, and the BoQ sums the geometry.

## Result

| NetVolume pairs (13 models) | before | after |
|---|---:|---:|
| pairs | 6,405 | 6,405 |
| agree | 6,172 | 6,172 |
| simplified-section | - | **120** |
| assembly-total | - | **23** |
| not-stored | - | **7** |
| **unexplained** | **233** | **83** |

GrossVolume: the 22 Mini Project accessories also move to
`simplified-section` (unexplained 34 to 12). No other row on the 13 models
changed cause (diff of the two outputs, timings aside).

**What changes in a bill of quantities** (sum of `rowQuantities` per class,
old code against new):

- skolebygg, IfcMember: 18.16 m3 to 11.52 m3. The stringers that had no
  unit slip on their GrossVolume were summing the whole stair's 1.3 m3 each:
  6.64 m3 of concrete and steel that is not there, on a class that is 37%
  phantom.
- schependomlaan, IfcWindow: 7.36 to 8.46 m3; the six skylights count their
  1.1 m3 instead of 0.
- Mini Project: volume +0.008 m3 and weight +58 kg on 829 t, since the parts
  affected are small (angles, eyes, pins). On a model framed in rolled
  sections the same rule moves every member 2 to 5%.

## The 83 left

- schependomlaan, 63 windows and 18 doors (faceted, ArchiCAD): stored
  "Net Volume" 29 to 70% under the body. Identical bodies (same window type,
  same computed 0.11359 m3) store different figures (0.08143 and 0.07986), so
  the stored value depends on the placement, likely the wall it sits in; not
  named here.
- schependomlaan, 2 "zinkwerk" coverings 3.5% under: a drawn profile.

## What this does not show

Each cause comes from one model (Tekla's habit from Mini Project, the stair
total from one Revit export). The polygon side counts (8 for a 10 mm radius,
16 for 30 mm) are what this file uses; which count Tekla picks for other radii
is not known, so the rule tries 6 to 24 sides and needs a 0.5% match. That
the clipped I sections keep the area ratio is exact for doubly symmetric
sections and approximate for an L, whose fillet moves the centroid.
