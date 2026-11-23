# One Tekla model in three schemas: why its beams and walls measured differently (2026-11-23)

**Question.** `eval/qto-psets-2026-11-23.md` measured one Tekla Structures
Educational 2026 model exported three times, as IFC2X3, IFC4 and IFC4X3. The
fill's geometry reading agreed with Tekla's stored `NetVolume` on 150 of 151
values in the IFC4 file, but on only 51 of 68 beams in the IFC2X3 file and
61 of 68 in the IFC4X3 file. It is the same model, so the gap had to be in how
each export writes the bodies. Which way is right, and what should the fill
write?

## Files

The Tekla 2026 twins from `github.com/Hygros/ifc-kbob-ai-matcher` (MPL-2.0)
at `88a8c59`, fetched by `eval/fetch-qto-psets.sh` (not committed). Checked
against `github.com/ThatOpen/engine_web-ifc` at `c4a65a3`,
`tests/ifcfiles/public/` (blob-less sparse clone, not committed): its three
Tekla exports (ISSUE_021_Mini Project, ISSUE_102_M3D-CON and -CON-CD) and
the other 25 files for the wall change.

## Matching the twins

`node eval/beam-schema-twins.mjs 2X3.ifc 4.ifc 4X3.ifc` matches every element
across the three files by GlobalId and lists each `Qto_` value that reads
within 2% in one schema and not in another. Before this change it listed 53:

| what | values | stored | IFC2X3 reads | IFC4 reads | IFC4X3 reads |
| --- | ---: | --- | --- | --- | --- |
| HEA300 piles ("Rammprofil"), NetVolume | 10 | 0.05314 | 0.05626 | 0.05314 | 0.05314 |
| HEA200 and one larger I beam, NetVolume | 7 | 0.00766, 0.03931 | 5.4% over | on | 5.4% over |
| walls, Length and Height | 18 | 10 / 2.5, 2.46 / 3.2 | on | none | none |
| railings (single IPE80 members), Length | 14 | 1.1, 12, 12.2 | on | none | none |
| plates, NetVolume | 4 | 0.025 | on | on | (not in that file) |

### The beams: Tekla's NetVolume leaves out the root fillets

In the IFC2X3 file the pile's body is `IFCISHAPEPROFILEDEF('HEA300', 300,
290, 8.5, 14, 27)` extruded 5,000 mm, with the 27 mm root fillets. The IFC4
file writes the same pile as a 24-point tessellation with no fillets. The
section areas:

- with the fillets (the catalogue's HEA300): 11,253 mm², x 5 m = 0.05626 m³;
- without them: 2 x 300 x 14 + 262 x 8.5 = 10,627 mm², x 5 m = 0.05314 m³.

Tekla stores both figures. Its own `Quantities` set on the pile holds
`GrossVolume` 0.05625 and `NetVolume` 0.05314, and the `Qto_BeamBaseQuantities`
property set repeats the NetVolume. So in Tekla, GrossVolume is the catalogue
section times the length, and NetVolume is the modelled solid, which has no
fillets. The IFC4X3 export writes most members as tessellations, like the IFC4
one, but writes the HEA200s as parametric profiles, which is why it differs on
7 beams and not 17.

So the measuring was not wrong in any schema. The IFC2X3 reading is the true
steel volume, but a NetVolume the fill writes into a Tekla model should match
the figure Tekla writes for the member next to it.

### The walls: laid on their side

The IFC4 and IFC4X3 exports write a wall as a tessellated box in a frame whose
own y is up (`Ausfachung`: x 0 to 2,460, y -1,600 to 1,600, z -100 to 100),
with no Axis. `addWallLines` read a wall only when the body's own z was the
world's up, so all 18 values had no reading.

### The railings

They are single IPE80 members that Tekla classes as railings. They read in
IFC2X3 (an extruded profile) and not in IFC4 (a tessellation). Not handled
here: see Next.

## What changed (`geometry-quantities.mjs`)

1. **Tekla's NetVolume convention** (`addNetVolumeConventions`). Some members
   are Tekla-authored (going by the owner history's application) and have a
   body that is one `IfcExtrudedAreaSolid` of a parametric section with radii.
   For a column, beam, member or pile like that, NetVolume is the measured net
   less the fillets' share of the gross. The share comes from geom.mjs
   `sectionVariants`' "no fillets" ratio, which the takeoff's cause finder
   already used to explain Tekla's stored volumes. GrossVolume is left as
   measured. The NetWeight a density gives follows NetVolume. Other tools'
   conventions are not known, so nothing changes for them.
2. **Walls laid on their side** (`uprightFrame`). The wall has to have no
   Axis, and its body has to run along its own x, as Tekla draws a wall. The
   body is turned so that the world's up is z and its side normal is y, then
   read as before. The second condition was added after the corpus check
   below: M3D-CON's four 1.45 x 1.5 x 3 m piers stand on their own x, and Tekla
   stores their Length along that x (3.0 m, upright). That is against the
   `Qto_` definition, so they are held back.

## Result

**Tekla's no-fillet NetVolume** (`node eval/tekla-net-volume.mjs`, output
`eval/tekla-net-volume-2026-11-23.txt`). For each member the convention
changes and that stores a NetVolume, the stored figure is compared with the
measured one, fillets in and fillets out:

| File | members changed | store a NetVolume | within 2%, fillets in | within 2%, fillets out | worse |
| --- | ---: | ---: | ---: | ---: | ---: |
| ISSUE_021_Mini Project.ifc | 85 | 85 | 37 | **85** | 0 |
| test-2026-2x3.ifc | 17 | 17 | 0 | **17** | 0 |
| test-2026-4.3.ifc | 7 | 7 | 0 | **7** | 0 |
| M3D-CON, M3D-CON-CD, Tekla-Export, test-2026-4 | 0 | | | | |
| **total** | **109** | **109** | **37** | **109** | **0** |

Mini Project is an independent Tekla export, not used to find the rule, and
85 of 85 match. The 37 that matched before are sections whose fillets are
under 2% of the area.

**The twins again** (`eval/beam-schema-twins-2026-11-23.txt`): 53 values read
differently by schema before and 18 after: the 14 railings, and the 4 plates
that are missing from the IFC4X3 file.

**Tekla's `Qto_` property sets as a whole** (`eval/qto-psets-after-twins-2026-11-23.txt`,
the same command and files as `eval/qto-psets-2026-11-23.md`, wall side areas
left out of Tekla-Export as there):

| File | geometry gives one, before | within 2%, before | gives one, after | within 2%, after |
| --- | ---: | ---: | ---: | ---: |
| test-2026-2x3.ifc | 183 | 165 | 183 | **182** |
| test-2026-4.ifc | 151 | 150 | 169 | **168** |
| test-2026-4.3.ifc | 147 | 140 | 165 | **165** |
| Tekla-Export.ifc | 102 | 96 | 140 | **134** |
| **Tekla total** | **583** | **551 (94.5%)** | **657** | **649 (98.8%)** |

Beam NetVolume is 68 of 68 in IFC2X3 (51 before) and 68 of 68 in IFC4X3 (61
before). Walls' Length and Height now read: 9 + 9 walls in the IFC4 and IFC4X3
twins and 19 in the older Tekla-Export.

**Walls turned upright, across the corpus** (`node eval/sideways-walls.mjs`,
output `eval/sideways-walls-2026-11-23.txt`, all 28 web-ifc public files and
the 12 Hygros files):

| File | walls turned | Length within 2% of stored | Height within 2% of stored |
| --- | ---: | ---: | ---: |
| Tekla-Export.ifc | 19 | 19 of 19 | 19 of 19 |
| test-2026-4.ifc | 9 | 9 of 9 | 9 of 9 |
| test-2026-4.3.ifc | 9 | 9 of 9 | 9 of 9 |
| ISSUE_171 (sample entities) | 1 | nothing stored | nothing stored |
| every other file | 0 | | |

That is 74 of 74 stored figures. ISSUE_171's wall panel reads 4.0 m by 1.9 m,
and its world box is 1.9 m tall. M3D-CON's four piers are held back. Before
the own-x condition they read 0 of 4.

**Fill.** The cost-estimating IDS (`eval/qto-from-geometry/base-quantities.ids.xml`)
still leaves 17, 37 and 36 failing elements on the twins: those beams already
store a NetVolume, so the change is in what a missing one would be filled
with, not in how many are filled.

Tests: `geometry-quantities.test.mjs`, "a wall placed on its side is turned
upright; a Tekla member's NetVolume leaves out its section's fillets, its
GrossVolume keeps them" and "uprightFrame takes the world's up to z and the
side normal to y".

## Next

- The 14 Tekla "railings" (single IPE80 members) read from IFC2X3's extrusion
  and not from IFC4's tessellation: `railings.mjs` looks for a top rail, and a
  single member has none. Read a one-member railing as a member (its length
  along the body).
- A Tekla member drawn as a clipped extrusion (`IfcBooleanClippingResult`)
  keeps its fillets in NetVolume. The fillet share of a clipped prism is
  close to the uncut one's, but no stored figure here has tested it.
- An ARCHICAD or Revit export of a rolled section with a stored NetVolume, to
  learn whether those tools keep the fillets.
