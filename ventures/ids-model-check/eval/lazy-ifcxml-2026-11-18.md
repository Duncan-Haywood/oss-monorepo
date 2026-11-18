# ifcXML read as it streams, geometry read on demand (2026-11-18)

The README's Limitations said "the ifcXML reader holds the whole XML tree in
memory, a few times the heap of the same model as STEP" and "The ifcXML reader
still reads everything up front." The STEP reader had been lazy since
`eval/heap-200mb-2026-11-17.md`. This run gives the ifcXML reader the same
treatment and measures it.

## A large ifcXML to measure on

No public ifcXML file over 0.6 MB was found: the largest of the 55 this
checker has been tested on is buildingSMART's
`tessellation-with-pixel-texture.ifcxml` (604 KB), and GitHub's code search
indexes nothing bigger. So `eval/step-to-ifcxml.mjs` writes a real STEP export
as ifcXML in xBIM's IFC2X3 layout (the one in `4walls1floorSite.ifcxml`: every
entity at the top under `<uos>`, each attribute a child element, references
`<IfcX ref="iN" xsi:nil="true"/>`, lists as `ex:*-wrapper` items).

Its `--check` mode reads the XML back and compares every entity's arguments
with the STEP reader's (references mapped back by `iN` = `#N`). On the seven
`opensourceBIM/IFC-files` exports at `cb96c50` (HHS Office MEP, MEP2,
architect, architect2, construction, construction2 and OpeningDesign's
Schultz Residence; fetch steps in `model-attr-codes-2026-11-17.md`):

| export | STEP entities | same after the round trip |
|---|---|---|
| HHS MEP | 665,224 | 665,224 (664,493 before the fix below) |
| HHS MEP2 | 665,224 | 664,493 before the fix |
| HHS architect, architect2 | 224,884 each | all |
| HHS construction, construction2 | 67,898 each | all |
| Schultz Residence | 424,819 | all |

### A reader fault the round trip found

The 731 differences in each MEP file were one fault in the reader, not the
writer: `IFCPROPERTYSINGLEVALUE('Electrical Data',$,IFCLABEL(' 277 V/1-64 VA'),$)`
has a leading space, and the ifcXML reader trimmed every text value before
casting it, so the same label read as `'277 V/1-64 VA'` from ifcXML.
`xs:string` keeps its whitespace, and so does STEP; an IDS value test or
pattern on that label gave a different verdict on the two forms of one
model. `ifcxml.mjs` now keeps string values as written (numbers, enums and
booleans are still trimmed). After the fix all 665,224 MEP entities match.
The 43 STEP/ifcXML twins of `eval/ifcxml-twins-2026-11-18.md` give the same
output before and after (`node eval/ifcxml-twins.mjs $(sh eval/fetch-ifcxml-twins.sh --dirs)`,
diffed: no line changes; verdicts 129 of 129), and the xBIM reading of
`4walls1floorSite` is unchanged (2,205 attribute values identical).

## What changed

- `xml.mjs`: `parseXml(text, { onClose, spans })`. `onClose(node, stack)` is
  called as each element closes; returning true drops it from its parent.
  `spans` records each element's start and end offsets.
- `ifcxml.mjs`: each top-level entity element (every open element between it
  and the root is neither an entity nor a header, the old `walk`'s rule) is
  read as it closes and dropped, so the tree is never held whole. Entities are
  numbered in the same order as before.
- Geometry (`IfcRepresentationItem` and its subtypes, the STEP Model's rule)
  becomes a `LazyXmlEntity`: its element's span, with `args` read again from
  that text on each access and not kept. An inline (id-less) entity nested in
  one is numbered by its start offset, so a re-read names the same id. A
  geometry entity that a relationship's back-pointer patches is kept.
- `shallowArgs` for those entities is kept from the first read: lists as
  `EMPTY_LIST`/`SKIPPED_LIST`, references as one shared marker, rows of only
  markers, nulls, booleans and enums shared. Without it, the 68-IDS run below
  took 20.4 s on HHS MEP (it re-parsed every point's XML once per
  attribute-on-every-entity specification); with it, 8.7 s.
- `parseIfcXml(text, schema, { eager: true })` keeps the old behaviour.

## Results

`eval/heap-compare.mjs` (parse once, check against each IDS with
`maxFailed: 1000`, SHA-256 of every report with `seconds` removed). The
comparison side is `origin/main` at `4a236debe` with only the whitespace fix
applied, so the hashes test that streaming and laziness change no report.
IDS sets: the 3 starter files, and those plus the 65 public files from
`eval/fetch-audit-corpus.sh` (68; one public file is not a readable IDS and
fails the same way on both sides). Node 22.23.5, 4 vCPU.

| model (ifcXML) | IDS | main: time, peak RSS | this change | reports |
|---|---|---|---|---|
| HHS MEP, 152 MB | 3 starter | 7.6 s, 1,491 MB | 6.4 s, 498 MB | identical |
| HHS MEP, 152 MB | 68 | 10.3 s, 1,680 MB | 8.7 s, 681 MB | identical |
| Schultz, 93 MB | 3 starter | 4.6 s, 937 MB | 3.6 s, 308 MB | identical |
| Schultz, 93 MB | 68 | 5.5 s, 1,054 MB | 5.5 s, 419 MB | identical |
| federated, 374 MB | 68, 8 GB heap | 36.2 s, 3,988 MB | 29.7 s, 1,529 MB | identical |
| federated, 374 MB | 68, 1 GB heap | out of memory | 30.1 s, 1,133 MB | |

The federated model is `eval/federate.mjs` over HHS MEP, MEP2, architect and
construction (96 MB as STEP, 1,623,230 entities), then
`eval/step-to-ifcxml.mjs`. The same model as STEP takes 14.3 s and 1,152 MB
with the 68 IDS files; ifcXML is still about twice as slow, mostly in the
XML tokenizer and the garbage collector (`--cpu-prof` on HHS MEP before the
change: 28.5% GC, 15.1% `parseXml`).

Parse alone (`--expose-gc`, heap after a collection): HHS MEP 7.1 s to
5.6-6.2 s, retained heap 371 to 330-334 MB (the model text itself is 152 MB
of it), peak RSS 1,487 to 449-492 MB.

Lazy and eager reads give equal arguments, types, ids and errors for every
entity of all 55 ifcXML files at hand (xBIM's 9 files, the 43 Annex E and
GeometryGym twins, the sample, the two converted exports): 1,097,088
entities, 930,976 of them read lazily, 0 differences. `ifcxml.test.mjs`
checks the same on the sample and the IFC2X3 fixture, plus an inline point
nested in a placement keeping its id across re-reads.

## Limits

- A V8 string holds at most about 512 M characters, so an ifcXML file much
  past 500 MB cannot be read at all, lazy or not; the federated 374 MB is
  near the largest this reader can take. As STEP, the same model is 96 MB.
- The converted files are one writer's layout (xBIM's IFC2X3). The nested
  IFC4 layout is checked for equality on the 43 twins and xBIM's IFC4 files,
  all under 0.6 MB, not timed at scale.
- Re-reading geometry costs an XML parse per access. Only a specification
  with no entity facet reads full geometry arguments, and attribute tests use
  `shallowArgs`, so the 68-IDS run does not pay it; a check that reads every
  point's coordinates many times would.
