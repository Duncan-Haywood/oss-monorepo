# Attribute requirements on every entity: geometry read shallow (2026-11-18)

`eval/no-entity-facet-2026-11-17.md` left one gap: a specification whose
applicability or requirement is an attribute facet matching any attribute
name still read every entity's full arguments, geometry included. The case is
real. OpenAEC's NL-BIM Basis ILS fixture (`claude-code/fixtures/NL_BIM_Basis_ILS.ids`
in OpenAEC-Foundation/OpenAEC-BIM-validator) writes the attribute name as
`<n>` rather than `<name>`, so its facets match every attribute: "(3.6)
Classificatiesysteem" applies to `attribute (any)` and so to all 665,224
entities of the HHS MEP export, three quarters of them Cartesian points,
poly loops and faces, and "(3.4)" asks for `attribute (any) = "?"`.

## Where the time went

`--cpu-prof` on the HHS MEP export (39.6 MB, IFC2X3) with that fixture
alone: 10.2 s, of which 34% was the garbage collector and 20% the STEP
reader's `value()`. Geometry's arguments are not kept after a read
(`eval/heap-200mb-2026-11-17.md`), so each specification that tests an
attribute on a point read `((0.,1.,2.))` again, built the arrays and numbers,
and threw them away.

An attribute test never needs what is inside a list. `AttributeFacet.test`
asks of each matching attribute whether it is null or derived, whether it is
empty (an empty list counts as empty), and, when the facet has a value,
compares only scalars: a list fails with "is a list; IDS cannot compare its
value" whatever it holds.

## What changed

- `step.mjs`: `Reader.shallowList()` reads an entity's top-level arguments
  and steps over each nested list without building it (strings, `''`, `\S\'`
  and `/* comments */` inside are stepped over too). The list's stand-in is a
  shared frozen `EMPTY_LIST` or a one-item `SKIPPED_LIST`, so emptiness and
  "is an array" are kept.
- `StepEntity.shallowArgs` returns that for the types whose arguments are not
  kept (IfcRepresentationItem and its subtypes). For any other type, or an
  entity already read, it returns `args`. If the shallow read throws, the full
  read runs, so a broken record still records its error.
- `ids.mjs`: `AttributeFacet.test` reads `e.shallowArgs || e.args`. No other
  facet changed. ifcXML entities have no `shallowArgs` and are read as before.

## Results

Reports are SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`). The IDS files are the 3 starter files and the 65 public
ones from `eval/fetch-audit-corpus.sh`; one public file is not a readable
IDS and fails the same way on both sides. Models are from
`opensourceBIM/IFC-files` at `cb96c50` (fetch steps in
`model-attr-codes-2026-11-17.md`). "main" is `origin/main` at `e62935402`,
unpacked with `git archive`. Node 22, 4 vCPU. Each model is parsed once.

OpenAEC fixture alone, HHS MEP:

| | main | this change | report |
|---|---|---|---|
| time | 10.2 s | 4.7 s | identical |
| peak RSS | 995 MB | 488 MB | |

All 68 IDS files:

| model | main | this change | reports |
|---|---|---|---|
| HHS MEP 39.6 MB | 13.3 s, 1,024 MB RSS | 8.3 s, 646 MB | identical |
| HHS architect 13.1 MB | 4.9 s, 469 MB | 3.3 s, 284 MB | identical |
| HHS construction 3.9 MB | 1.4 s, 241 MB | 1.0 s, 186 MB | identical |
| Schultz Residence 22.5 MB | 7.0 s, 528 MB | 3.4 s, 303 MB | identical |
| federated 219 MB, `--max-old-space-size=2048` | 114.3 s, 2,069 MB | 67.5 s, 1,838 MB | identical |
| federated 219 MB, `--max-old-space-size=1024` | out of memory | 113.7 s, 1,287 MB | same as at 2 GB |

The federated model is `eval/federate.mjs` over nine HHS Office and
OpeningDesign exports (steps in `eval/heap-200mb-2026-11-17.md`). The
68-file run on it now fits a 1 GB heap, which
`eval/no-entity-facet-2026-11-17.md` listed as left to do.

Profiled after the change, the 68-file run on HHS MEP spends 3% in the STEP
reader's `value()` and 11% in the garbage collector. Before the change, the
OpenAEC fixture alone spent 20% and 34% there. These are different runs, so
read the shares as a direction, not a ratio.

## Checks

- `node --test *.test.mjs`: 189 tests, 187 pass, 2 skipped. The new test in
  `engine.test.mjs` builds points, an empty point, a poly loop, point lists
  with nested and `(())` rows, a typed index list, a text literal whose string
  holds `)`, `(` and `''`, and a comment holding `)` inside a list. Every
  entity's shallow arguments must match its full ones (scalars equal,
  emptiness equal for lists). Fifteen specifications (five attribute
  requirements, any name or a fixed name, with and without values, in each of
  the three cardinalities) must give the same report as a model whose
  arguments are all read in full. Two planted faults each fail it: every
  skipped list read as non-empty, and `(())` read as empty.

## What is left

- On HHS MEP the profile is now led by `psetsOf`'s `add` (15%) and the
  property prefilter (11%): the property-set specifications that apply to
  every entity.
- The ifcXML reader still builds every entity up front.
- Under a 1 GB heap the federated run is 1.7x slower than at 2 GB (113.7 s
  against 67.5 s): the collector runs more often.
