# Cycles of wholes: what catches A part of B, B part of A (2026-11-24)

**Question.** `eval/where-rules-global-seeds-2026-11-24.md` seeded a record
listed among its own parts, which `IfcRelAggregates.NoSelfReference` names.
Its "Next" asked about the case no rule names: a loop across two records
(A holds B, B holds A). Do a WHERE rule or an inverse count catch it? Does
`ifcopenshell.validate`? What does an IDS partOf check do on such a model?

**Answer.** The schema catches a loop only by accident, when closing it gives
the whole a second parent and a `[0:1]` inverse (and, for spatial wholes,
`IfcSpatialStructureElement.WR41`) overflows. A loop between two records that
had no other parent passes IFC2X3, IFC4 and IFC4X3, and
`ifcopenshell.validate` 0.9.0 with its EXPRESS rules finds nothing new.
**IfcTester 0.9.0 never returns on those files.** Its partOf check climbs
`get_aggregate` / `get_nest` in a `while` loop with no record of where it has
been, so it spins as soon as the class it is looking for is not on the loop.
In the seeded files below, the loops nothing in the schema caught are exactly
the loops IfcTester hung on: 31 of 31, and none of the others.

This checker now reports a `decomposition-cycle` in the conformance pass for
every loop through the relationships an IDS partOf facet follows
(aggregation, nesting, containment, group assignment, voids and fills, in
any mix): 187 of 187 seeds named, 0 of the 102 public originals flagged. A
failing IDS row on an element in or below a loop carries a note naming it.
Its own partOf walk always stopped (it keeps a visited set), but it listed an
element as its own whole when the walk came back round; it no longer does.

## The seeds

`eval/decomposition-cycles.mjs` closes one loop of two records per family in
each file by appending one relationship (a 22-character GlobalId, the file's
owner history), then runs the full conformance pass (schema shape, inverse
counts, WHERE rules) on the original and on the copy.

| Family | What the seed writes | Files | Caught by the schema (inverse count, WR41) | Nothing in the schema | `decomposition-cycle` | IfcTester hung |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `assembly-cycle` | a part of a non-spatial whole (stair, element assembly, curtain wall, roof) aggregates its whole | 28 | 0 | 28 | 28 | 28 |
| `nest-cycle` | a nested part nests its host (IFC4, IFC4X3: a port and its element, an alignment segment, two tasks) | 6 | 3 | 3 | 6 | 3 |
| `spatial-cycle` | a spatial part (storey, space, a second site) aggregates its spatial whole | 56 | 56 | 0 | 56 | 0 |
| `containment-cycle` | an element contained in a spatial structure aggregates that structure | 97 | 97 | 0 | 97 | 0 |
| **all** | | **187** | **156** | **31** | **187** | **31** |

No seed took away a finding the original had (0 "lost" in every family).

Why the schema catches spatial and containment loops: the whole there is a
storey, building or site that already has a parent, so the seed gives it a
second `Decomposes`, which is `SET [0:1]` in all three schemas, and WR41
asks for exactly one. The three nest loops it caught were alignment
segments nesting their horizontal alignment, which was already nested once
(`Nests [0:1]`). Assemblies are usually contained in a storey, not
aggregated, so their `Decomposes` is empty and a loop of two fits in
`[0:1]` on both sides. The same holds for a port nesting its element
(ISSUE_159), a horizontal alignment nesting its alignment
(segmented-reference-curve) and two tasks
(construction-scheduling-task).

Why IfcTester does not hang on the caught ones: when the whole has two
parents, `get_aggregate` returns the original one and the walk climbs out of
the loop to the project.

## ifcopenshell.validate

On the 31 seeded copies nothing in the schema caught, `python -m
ifcopenshell.validate --rules --json` reports the same number of issues as on
the original, 31 of 31. (A first run gave one more issue on one file: the
seed had written a 24-character GlobalId. The seed was fixed and every
number here is from the second run.)

## IfcTester

`eval/decomposition_cycles_ifctester.py` gives each seeded file and its
original two specifications: every record of the part's class and of the
whole's class must be part of an `IFCPROJECTLIBRARY` (a class no chain
reaches, so the walk has to climb to the top), once through the family's
relationship and once with none named. Each run is a child process with a
60-second limit; the originals take about 1 s.

| Family | Files | Original hung | Seeded hung | Not opened |
| --- | ---: | ---: | ---: | ---: |
| `assembly-cycle` | 28 | 0 | 28 | 0 |
| `nest-cycle` | 6 | 0 | 3 | 0 |
| `spatial-cycle` | 56 | 0 | 0 | 2 |
| `containment-cycle` | 97 | 0 | 0 | 2 |

"Not opened": IfcOpenShell 0.9.0 refuses the IFC4X2 and IFC4X3_RC2 files.
Any IDS with a partOf requirement or applicability that climbs through the
loop would do the same, so on such a model an IfcTester run (and a tool built
on it) does not finish. This checker's CLI (`node cli.mjs FILE IDS`, which runs the conformance
pass too) finishes the same IDS on all 31 of those files, the slowest in
4.8 s.

## The check

`conformance.mjs` `decompositionCycles(E, S)` builds the part-to-whole graph
from `IfcRelAggregates`, `IfcRelNests` (IFC2X3's `IfcRelDecomposes`),
`IfcRelContainedInSpatialStructure`, `IfcRelAssignsToGroup`,
`IfcRelVoidsElement` and `IfcRelFillsElement`, finds its strongly connected
components with an iterative Tarjan (models nest deep; a 20,000-record chain
is in the tests), and writes one finding per component of two or more
records: the loop from its lowest id (`#1 in #3 in #2 in #1`), the
relationships that close it, and how many records sit below it. A record
listed among its own parts is left to the WHERE rules that already name it.
Every element in a loop or below it gets a `modelRules` note on a failing
IDS row.

On the 102 originals the check flagged nothing, and the whole pass over them
took 6 s.

## Reproduce

```sh
# web-ifc tests/ifcfiles/public (b6cf0ce), buildingSMART/Sample-Test-Files (5030f65),
# buildingSMART/IFC4.3.x-sample-models (ef22440): the same 102 files as
# eval/where-rules-global-seeds-2026-11-24.md
find webifc/tests/ifcfiles/public -name '*.ifc' -size -16M | sort > files.txt
find stf s43 -name '*.ifc' -size -16M | sort >> files.txt
tr '\n' '\0' < files.txt | xargs -0 node --stack-size=8000 eval/decomposition-cycles.mjs /tmp/seeded   # about 4 min
python -m venv v && v/bin/pip install ifctester==0.9.0 ifcopenshell==0.9.0.post1 pytest
v/bin/python eval/decomposition_cycles_ifctester.py /tmp/seeded/manifest.json --timeout 60 --jobs 4   # about 15 min, most of it the hung runs
```

`decomposition-cycle.test.mjs` pins the check on hand-written loops (two
assemblies, containment with aggregation, voids with fills, a three-record
loop on a 20,000-record chain), the self-reference left to the WHERE rule,
the partOf walk and row notes, and the eval's seeds on the bundled sample.

## Next

- `IfcRelNests` self-reference, and a typo search for other functions that
  compare an argument with itself (from the global-seeds report).
- A loop through `IfcRelAssignsToGroup` alone (two groups in each other) is
  named by the check (a hand-written case in the tests), but none of the 102
  files nests groups, so it was not seeded. IfcTester's group step with a
  relation named takes one step and does not climb; its no-relation walk
  (`get_parent`, then the first group) would, and is the one to try on a
  real file with nested groups.
