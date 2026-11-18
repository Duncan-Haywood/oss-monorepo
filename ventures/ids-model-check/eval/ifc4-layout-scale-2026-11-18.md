# IFC4-layout ifcXML at scale (2026-11-18)

`eval/lazy-ifcxml-2026-11-18.md` made the ifcXML reader stream: each
top-level element is read as it closes and dropped. It was measured on one
writer's layout, xBIM's IFC2X3, where every entity sits at the top. Its
Limits said "the nested IFC4 layout is checked for equality on the 43 twins
and xBIM's IFC4 files, all under 0.6 MB, not timed at scale." This run times
it and fixes what it found: one memory fault and one reading fault.

## The nested layout puts the model under one element

Real IFC4 writers nest. GeometryGymIFC's two example files put 97.2% and
97.4% of the file under one top-level element; buildingSMART's three largest
Annex E examples put 99.4% to 99.9% there (`node eval/xml-top-share.mjs`).
The IfcProject holds its sites through IsDecomposedBy, the storeys hold their
elements through ContainsElements, each element holds its property sets
through IsDefinedBy and its geometry inline. A reader that frees memory only
when a top-level element closes therefore holds almost the whole tree.

## A writer for the nested layout

No public ifcXML file over 0.6 MB was found (the earlier report), so
`eval/ifc4-layout.mjs` writes real IFC4 and IFC4X3 STEP exports in the nested
layout. It follows the twins: one `<ifcXML>` root, simple attributes as XML
attributes, each entity written in full where it is first used and by
`href="iN"` after that, select values as `-wrapper` elements, relationships
under the inverse of the object they point back to (objects first, so
IsDefinedBy goes under the wall and not under its property set), with a
single-valued pointer back left out, as the reader expects. Starting from the
IfcProject, 96.2% to 98.4% of each file below sits under one element, as in
the real writers' files.

Models, all from `ThatOpen/engine_web-ifc` at `0a725942`,
`tests/ifcfiles/public/` (fetched, not committed; `git clone --filter=blob:none
--no-checkout`, then `git checkout HEAD -- <file>`):

| export | schema | STEP | entities | nested ifcXML | under one element |
|---|---|---|---|---|---|
| C20-Institute-Var-2 (ARCHICAD 20) | IFC4 | 11 MB | 147,712 | 18.8 MB | 96.2% |
| FM_ARC_DigitalHub | IFC4 | 14 MB | 266,483 | 35.3 MB | 97.2% |
| ISSUE_159_kleine_Wohnung_R22 | IFC4 | 10 MB | 189,788 | 27.5 MB | 96.9% |
| Viadotto Acerno | IFC4X3_ADD2 | 32 MB | 253,318 | 39.0 MB | 98.4% |
| federated: the first three, twice each (`eval/federate.mjs`) | IFC4 | 73 MB | 1,207,966 | 165.6 MB | 21.2% (one of six projects) |

`node eval/ifc4-layout.mjs --check model.ifc` writes the XML, reads it back
and compares every entity's arguments with the STEP reader's: all entities of
all four exports are identical (857,301 of 857,301). A fifth file,
`ifcbridge-model01.ifc`, is IFC4X2; read with the IFC4X3 schema, 2,711 of
296,968 entities differ, all IfcStyledItem and IfcDerivedUnit pointing at
types IFC4X3 removed. That is the schema not matching the file, not the
reader, and it is left out below.

## Fault 1: the schema was read from the model's own text

The federated file read back 447,528 entities, not 1,207,966, with no parse
error a user would notice. `ifcXmlSchemaId` searched the first 4,000
characters for "IFC4X3", then "IFC2X3", then "IFC4". ARCHICAD's IFC4 export
writes `ApplicationIdentifier="IFC2x3 add-on version: 4009 GER FULL"` in its
owner history, and the nested layout puts the owner history within those
4,000 characters, so the file was read with the IFC2X3 schema. On
C20-Institute-Var-2 alone, main read 147,691 entities as IFC2X3, and 19 of
539 specification verdicts from the 68 IDS files differed from the same model
as STEP.

The version now comes from the start tags of the root element and of IFC2X3's
`<uos>` (namespace, `xsi:schemaLocation`, `configuration`). The rest of the
head is searched only when those tags name no version. Of the 59 ifcXML files
at hand (xBIM's 9 documents and their copies, the 43 twins, the sample, the
six converted files) only the two ARCHICAD-written files change reading,
IFC2X3 to IFC4; the other 57 read as before.

## Fault 2: memory, the tree under the root

Geometry nested inside a larger element is now cut down as it closes: its
children, text and value attributes are dropped, and only its span and the
attributes that say what it is (`id`, `href`, `ref`, `xsi:type`) are kept. The
walk still runs parent first and parses a stub again from its span when it
reaches it. So entities are numbered and ordered exactly as before, and
reports, which print those numbers, do not change. Only geometry
(IfcRepresentationItem and its subtypes, whose arguments the reader does not
keep anyway) is cut. Property sets and relationships are kept, because they
are read once and kept.

Reports are SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`), on the 3 starter IDS files plus the 65 public ones from
`eval/fetch-audit-corpus.sh` (68; one public file is not a readable IDS and
fails the same way everywhere). "main" is `origin/main` at `8bd1b8ba4`. For the
two ARCHICAD-written files, main misreads the schema, so the comparison side
is main with only fault 1's fix applied. Node 22.23.5, 4 vCPU.

| model (nested ifcXML) | main: time, peak RSS | this change | reports |
|---|---|---|---|
| FM_ARC_DigitalHub, 35 MB | 4.4 s, 485 MB | 4.3 s, 388 MB | identical |
| kleine_Wohnung, 28 MB | 3.6 s, 446 MB | 4.3 s, 349 MB | identical |
| Viadotto Acerno, 39 MB (IFC4X3) | 3.1 s, 373 MB | 3.6 s, 364 MB | identical |
| C20-Institute-Var-2, 19 MB (main + schema fix) | 3.0 s, 313 MB | 2.9 s, 303 MB | identical |
| federated, 166 MB (main + schema fix) | 23.9 s, 1,770 MB | 27.7 s, 1,481 MB | identical |
| federated, `--max-old-space-size=1024` | 28.1 s, 1,168 MB | 27.7 s, 1,033 MB | identical |
| federated, `--max-old-space-size=768` | out of memory | 30.2 s, 905 MB | |
| federated, `--max-old-space-size=512` | out of memory | out of memory | |

The same federated model as STEP: 15.4 s, 1,032 MB.

Parse alone, federated (`--expose-gc`, heap after a collection): 11.2 s to
13.7 s, peak RSS 1,498 to 954 MB, retained heap 667 MB both ways. The tree
was transient: it set the peak, not what is kept. The cost is a second XML
parse of each nested geometry element, about 20% more parse time here.

The flat xBIM layout does not change: HHS Office MEP (`opensourceBIM/IFC-files`
at `cb96c50`) written by `eval/step-to-ifcxml.mjs`, 3 starter IDS files: 7.2 s
and 500 MB on main and on this change, same hash.

## The verdicts against STEP

`node eval/ifc4-layout-verdicts.mjs "a.ifc|b.ifc" ids...` checks each model as
STEP and as nested ifcXML against every IDS file and compares, per
specification, its status and its applicable, passed and failed counts. On
the four exports with the 68 IDS files: 2,160 of 2,160 the same (540 per
model). On main, C20-Institute-Var-2 gave 520 of 539.

Lazy, eager and main's reads agree on every entity (id, type, xml id,
arguments, order) and on the notes, for the 45 small files
(`node eval/ifcxml-lazy-eager.mjs --against <main>/ifcxml.mjs ...`: the sample,
the 43 twins and C20 nested; 152,874 entities, 47,102 of them read lazily).

## Checks

- `node --test *.test.mjs`: the venture's suite passes (two tests skip, as
  before: they need fetched corpora). Three new tests in `ifcxml.test.mjs`:
  - The tiny-house sample is written in the nested layout. It reads back
    entity for entity; lazy and eager reads agree; the starter IDS verdicts
    equal the STEP file's.
  - A hand-written nested polyline document: stubbed, lazy and eager reads
    agree, 5 elements are stubbed, and inline points, hrefs into and out of
    stubs, and ids survive repeated reads.
  - The ARCHICAD owner history no longer sets the schema.
- Planted faults, each run against `ifcxml.test.mjs`:
  - a stub expanded without its href rewrite fails the polyline test;
  - a stub parsed again without its base offset fails it, the Annex E forms
    test and the inline-id test (inline ids are keyed by file offset);
  - the old schema sniff fails the schema test.
- Two changes fail no test, and need not: a stub that keeps no `id` (a stub
  is always expanded before its id is read), and stubbing every nested
  entity, not only geometry (the walk expands it the same way; only memory
  and time differ).

## What is left

- No real ifcXML file of this size exists in public, as far as two runs'
  searches found. The writer copies the layout of the 43 twins and xBIM's IFC4
  files, not every writer's quirks.
- Property sets and relationships nested under the root are still held until
  the root closes. Cutting them too would mean numbering entities in another
  order, which would change the `#N` numbers reports print for ifcXML models.
- The nested federated file is still 1.4x the STEP file's peak, and 1.8x its
  time.
