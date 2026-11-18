# Nested ifcXML read as it closes (2026-11-18)

`eval/ifc4-layout-scale-2026-11-18.md` left one item: in the nested IFC4
layout, property sets and relationships under the root "are still held until
the root closes", because cutting them too "would mean numbering entities in
another order, which would change the `#N` numbers reports print". This run
removes that hold without changing a number.

## What changed

Every entity element nested inside another (property sets, properties,
relationships, storeys, walls, and geometry at any depth) is now read into
its record when its own element closes. The element is then swapped in its
parent's list for a small object that holds the record. Nothing under the
root is kept as XML.

Numbers are the hard part. The reader numbers entities parent first, in
document order: the IfcProject is #1 and its first relationship #2. A read
from the inside out meets the property value before the property set, the
wall and the project. So an early read gives provisional numbers (-2, -3, ...)
and keeps a small trace for each entity: its record, then the ids it met and
the entities it holds, in the order the old walk met them. When the
top-level element closes, the walk reaches each emptied element and replays
its trace. That gives the final numbers in the old order. A reference held
under a provisional number is then rewritten to the final one. The trace
also replays three things the old walk did in order:

- Notes (a misspelt attribute name, a flat B-spline list, the
  decimal-comma count and its example) come out in walk order.
- A second element with an id already read is skipped, with everything in
  it, as before.
- Relationship back-pointers are put back in the same order.

An inline entity inside geometry records its start offset. A geometry
element read again from its text later then names it by the same number.

Geometry is now read from the tree it already has as it closes. The old
reader cut it to a stub and parsed its text a second time during the walk.

## Same output as before

`node eval/ifcxml-lazy-eager.mjs --against <main>/ifcxml.mjs ...` compares,
for each file, every entity's number, type, xml id, arguments and map order.
It checks the lazy read against the eager read and against main's reader
(`origin/main` at `84e50a2e9`). It now also compares the notes against
main's. The files: the sample, xBIM's 9 documents and their copies, the 43
twins (`eval/fetch-ifcxml-twins.sh`, `eval/fetch-xbim-samples.sh`), and the
four real exports written nested by `eval/ifc4-layout.mjs`. All 57 files
match, 864,346 entities, with no difference in entities or notes.

Reports were hashed with `eval/heap-compare.mjs` (3 starter IDS files plus
the 65 public ones from `eval/fetch-audit-corpus.sh`, `maxFailed: 1000`).
Main and this change give the same hash on all five models below.

## Memory and time

Models: `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`, written nested
by `eval/ifc4-layout.mjs`. The federated file is the first three, twice
each, via `eval/federate.mjs`, as in the earlier report. Node 22, 4 vCPU.
"Smallest heap" is the lowest `--max-old-space-size`, in steps of 16 MB
(64 MB for the federated file), at which parsing alone finishes. It is the
figure that decides whether a model opens on a small machine or a CI runner.

| model (nested ifcXML) | smallest heap, main | this change | parse, main | this change | 68 IDS, main | this change |
|---|---|---|---|---|---|---|
| C20-Institute-Var-2, 19 MB | 160 MB | 96 MB | 1.1 s | 1.2 s | 2.7 s | 2.7 s |
| FM_ARC_DigitalHub, 35 MB | 160 MB | 160 MB | 2.6 s | 2.3 s | 4.1 s | 3.7 s |
| kleine_Wohnung, 28 MB | 144 MB | 128 MB | 1.8 s | 1.7 s | 3.3 s | 3.2 s |
| Viadotto Acerno, 39 MB (IFC4X3) | 128 MB | 112 MB | 1.9 s | 1.8 s | 2.7 s | 2.8 s |
| federated, 166 MB (six projects) | 704 MB | 704 MB | 11.0 s | 12.1 s | 22.4 s | 24.3 s |

Retained heap after parsing is the same both ways (43-65 MB for the single
files, 312-313 MB federated). The saving is the transient tree. It counts
when a file holds one project, which is how IFC4 writers write a building.
It does not count for the federated file: there each of six projects is its
own top-level element, so the tree under any one was already small next to
the records kept for all six. Times are single runs; the differences are
within the spread between runs on this machine.

Two attempts that lost, kept as a record:

- A first version kept a parsed XML node per emptied element and a Map
  from provisional to final numbers. It needed 256 MB of heap on
  FM_ARC_DigitalHub, against main's 160 MB. A heap snapshot before the walk
  found 275,000 arrays and 245,000 entity records alive. The records are
  kept anyway, so the loss was the per-element overhead: each emptied node
  carried about 200 bytes.
- It also left elements inside geometry whole until the geometry element
  closed. The old reader cut nested geometry at every depth. Reading those
  early too, using a compact stand-in object and a typed array for the
  number map, and freeing the trace as it replays, brought FM_ARC_DigitalHub
  to 160 MB.

## Checks

- `node --test ifcxml.test.mjs`: 21 pass. One new test hand-writes a nested
  file and pins the numbers and notes the old reader gave it:
  - a project, storey, walls, a property set and properties;
  - a second wall with the same id;
  - an href to a property written after the root;
  - misspelt attribute names on the storey, a wall and a slab;
  - a decimal comma.

  The polyline test now counts 5 elements read early, lazy and eager alike.
- Planted faults, each run against `ifcxml.test.mjs`; every one fails at
  least one test:

  | planted fault | tests failed |
  |---|---|
  | a duplicate id not skipped | 1 |
  | references left provisional | 8 |
  | notes in close order, not walk order | 1 |
  | ref ids not mapped | 2 |
  | children replayed in reverse | 6 |
  | inline ids inside geometry left provisional | 3 |
  | inline entities in early-read geometry not recorded | 2 |
  | decimal commas not counted | 2 |
- `python3 platform/ci/run_venture_tests.py ids-model-check`: the venture's
  suite.

## What is left

- On a federated file, or any file with many top-level projects, the peak
  is the records themselves, not the tree. The next memory win there is a
  smaller record per entity, not a different read order.
- The nested files are still written by `eval/ifc4-layout.mjs` from STEP
  exports. No real ifcXML file of this size was found in public.
