# IFC5 (.ifcx) read, checked on 8 STEP/IFC5 twins and 47 public files, 2026-11-21

What was measured: whether `ifcx.mjs` reads an IFC5 alpha model into the
objects, spatial tree, properties, classifications and materials its STEP
twin has, so an IDS check of the `.ifcx` means what a check of the `.ifc`
means. And whether every public `.ifcx` file reads at all.

## Files

buildingSMART's IFC5 development repository
(`github.com/buildingSMART/IFC5-development`, commit `1a63082`, fetched by
`eval/fetch-ifcx-twins.sh`, not committed: the repository has no licence
file) publishes 47 `.ifcx` files in `examples/`. Eight sit next to the IFC
STEP file they were converted from: Hello Wall, Domestic Hot Water, IFC Hero
Model (IFC4), Georeferencing, Linear placement of signals, Railway (simple),
Road (IFC4X3_ADD2) and Tekla House (IFC2X3, 19 MB STEP, 42 MB `.ifcx`). The
rest are layers (fire ratings, a third window, a second storey), the PCERT
sample scene's eleven files, geotechnical, point cloud, tunnel excavation
stages and ACCA's Edificius export.

An `.ifcx` file is a list of nodes `{path, children, inherits, attributes}`;
many nodes may speak about one path and a later one wins. There is no
property set: a property is an attribute `bsi::ifc::prop::IsExternal`; the
class is `bsi::ifc::class {code, uri}`; a type object is a node the
occurrence `inherits`; the converters keep each STEP object's GlobalId as its
path (UUID `93791d5d-5beb-437b-b8ec-2f1f0ba4bf3b` is hello-wall's wall
`2JUHrTM_j3UxZiBnyBfByx`).

## Method

`node eval/ifcx-twins.mjs --ids-dir eval/corpus/real eval/twins/ifc5/examples`:

1. **Objects.** Every IfcObject with a GlobalId in the STEP file, paired with
   the IFC5 object of that GlobalId; class, predefined type and Name compared.
2. **What the IFC5 file says, checked on STEP.** For each paired object, every
   fact the reader produced (its class, predefined type, each partOf link,
   each property with its value, each classification, each material) is
   written as an IDS requirement on that object's GlobalId, and the IDS is
   checked on both models. On the IFC5 read every requirement must hold; on
   the STEP twin, one that holds is a fact the reader put where STEP has it.
   (TeklaHouse is sampled, every 8th object, 1,494 of 11,945: a GlobalId list
   of thousands in each applicability takes minutes.)
3. **Verdicts.** The 3 starter IDS and 65 public IDS files checked on both
   forms, compared as `eval/ifcxml-twins.mjs` does.

`node eval/ifcx-sweep.mjs eval/twins/ifc5/examples` reads all 47 files and
runs the 3 starter IDS on each.

## Result

| | main (`e0ecbc7d5`) | this change |
| --- | --- | --- |
| `.ifcx` files read | 0 of 47 (taken for ifcJSON: "no ifcJSON objects found") | 47 of 47, 14,090 objects, 0 reader or check errors |
| STEP objects paired by GlobalId | - | 12,116 of 12,915 (the other 799: Railway and Road carry no `bsi::ifc::class`, so 0 objects; hello-wall's 2 openings were dropped by the converter) |
| class the same | - | 12,115 of 12,116 (Hero Model's IfcFurniture written IfcFurnishingElement) |
| predefined type the same | - | 12,017 of 12,116 (the other 99: the IFC5 class code has no suffix, e.g. IfcWall for a PARTITIONING wall) |
| IFC5 facts that hold on the STEP twin | - | class 1,664 of 1,665; partOf 1,646 of 1,648; material 5 of 5; property in a standard set 24 of 30; property in no template set 0 of 6; classification 0 of 1 |
| TeklaHouse (42 MB) read and checked | - | 0.49 s, 249 MB resident |

Every fact the reader produced holds on its own read (1,665 + 1,648 + 5 + 30 +
6 + 1 of the same). The ones that do not hold on STEP, read one by one:

- **properties, 6 + 6**: hello-wall's `Height` and `Volume` on the wall,
  windows and space, `TypeName` on the windows and the windows' `IsExternal`.
  The STEP file has none of these: its only property set is the wall's
  Pset_WallCommon.IsExternal. The converter computed or added them. The
  standard-set ones (`Height` to Qto_WallBaseQuantities, Qto_WindowBaseQuantities,
  Qto_SpaceBaseQuantities; `IsExternal` to Pset_WindowCommon) are where an IFC4
  exporter would put them.
- **classification, 1**: hello-wall's `nlsfb::class 21.21`, which the STEP
  file does not have (the IFC5 example adds it).
- **partOf, 2** of linear-placement's 28 objects under its IfcAlignment are
  not nested in the STEP file.
- **class, 1**: the furniture above.

Two fixes came from this measurement before it was final: ports and an
alignment's layouts and segments are **nested** (IfcRelNests) in IFC4X3, not
aggregated (partOf 1,560 to 1,646 of 1,648); and a window's materials sit on
its type's unclassed Frame and Glazing parts, so materials on an object's
unclassed parts are rolled up to the object (material 1 to 5 of 5).

**Names.** IFC5 alpha has no Name attribute: an object's name is the key its
parent gives it in `children`, and the reader uses that as Name. It matches
the STEP Name on 132 of 12,116 objects; on 11,965 more it is the STEP Name
as the converter spelled the key (IfcOpenShell's: `SLB-150` written
`SLB_150`, a repeat `MIX_40_001`; Tekla's: `NUT (12)`). So an IDS that asks
for a Name pattern sees the key, not the STEP Name; one that asks for a Name
to be present passes on both.

**Verdicts.** The 68 IDS files give the same status and failing GlobalIds on
371 of 544 pair runs (identical, counts included, on 351). Every kind of
difference, grouped by the first failing element's reason
(`eval/ifcx-twins.mjs` prints the list), is information one file has and the
other does not: "has no property set" (the converters dropped every property
of Tekla House, 315,659, of the Hero Model, 724, and of Domestic Hot Water,
11), "has no material", "has no classification", "attribute is not set"
(IFC5 alpha carries no Description, ObjectType or Tag), a minOccurs
specification that applies to nothing on Railway and Road, and Name
patterns (above). None is a value the two read differently.

So the reader puts what an IFC5 file says where the checker looks for it; what
the alpha converters leave out is a gap in the files, which a check of the
`.ifcx` reports as failures, as it should.

## Layers

`--layer` (CLI) and a list of texts (`new Model([base, layer, ...])`) compose
layers weakest first. hello-wall + hello-wall-add-fire-rating-60 +
hello-wall-add-specific-fire-rating: the window type's FireRating is R30 and
the instance path `.../Wall/Window_001` overrides it to R60 on that window
only (`ifcx.test.mjs`). `3rd-window` and `add-2nd-storey` add a window and a
storey (5 and 7 objects over the base's 7). A layer read alone has no classed
objects (0 objects, no error), and the one instance path in a layer read
alone is named as not found.

## Limits

- A property's set is inferred: the standard set whose IFC4X3 template names
  it for the class (a number may be a quantity), else one set named after the
  namespace (`bsi::ifc::prop`). An IDS written for IFC5 with its own set
  names would need them to agree; IDS 1.0 has no IFC5 mode yet.
- Geometry, presentation, `bsi::ifc::system::*` (connections, systems) and
  linear referencing are not read: no IDS facet in this checker reads them
  for IFC5 yet.
- A path with `/` is applied to the child it names, which holds when that
  child is used once (every case in the public files).
- The `schemas` section and remote `imports` (ifcx.dev, which this session's
  proxy refused) are not read; values are typed by template, else by JSON.
