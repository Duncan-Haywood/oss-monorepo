# Attribute value tests on every entity: one shape read per entity (2026-11-18)

`eval/applies-cache-2026-11-18.md` left this open: "`AttributeFacet.test` on
every entity is still the largest self time on HHS MEP after the garbage
collector, now for facets that differ by value (the fixture's three
`attribute (any) = ...` requirements), which a verdict cache cannot share."

The fixture is OpenAEC's `claude-code/fixtures/NL_BIM_Basis_ILS.ids`
(OpenAEC-Foundation/OpenAEC-BIM-validator). It writes the attribute name as
`<n>` rather than `<name>`, so each of its attribute facets matches every
attribute of every entity. Its 12 specifications apply to all 665,224
entities of the HHS MEP export, and its requirements ask for `attribute (any)`
with no value and with three different values.

## What was repeated

Before an attribute facet compares a value, its verdict depends only on the
attribute name and the entity:

1. the name takes no attribute of the class: absent;
2. none of those attributes is set: absent;
3. one is set but empty: fails;
4. with no value asked for: passes;
5. one set attribute is a list, a reference, a select or binary, which IDS
   cannot compare: fails, whatever the value.

Only entities whose set attributes are all comparable scalars need the value.
On this export that is 190,924 tests in all. Geometry is almost all case 5:
a point's coordinates are a list, a face's bounds are references. Every
rooted object is case 5 too, because `OwnerHistory` is a reference.

The verdict cache keeps one byte per entity per facet, keyed on the whole
facet, value included. So the three values and the no-value facet each read
every entity's arguments again: 2,851,787 attribute tests over the 68 files.

## What changed

- `ids.mjs`: `AttributeFacet.shape(e, model)` returns cases 1 to 5 above as
  one code (`SHAPE_*`). It reads the same arguments `test()` reads.
- A verdict slot's byte held the verdict in values 1 to 3. An attribute
  facet's slot now also holds the shape in the bits above (`verdict |
  shape << 2`). The cache lists the kept slots by attribute name
  (`byName`). Before reading an entity's shape, `attributeVerdict` looks in
  the same byte of the other kept slots with that name. The shape costs no
  memory beyond the slots that already exist. Only case 5's scalars, and
  only for a facet with a value, run the full `test()`.
- The reasons written for a failing element still come from the full test.
  `check(..., { facetCache: false })` still turns all of it off.

An earlier version of this change kept a separate `Uint8Array` per attribute
name (four names, 4.6 MB each on the federated model). It was 15% faster.
It also ran the 219 MB federated model out of memory under a 1 GB heap,
where main fits, so it was dropped.

### A STEP reader fault the memory check found

The sharing version still ran out of memory at 1 GB on that same fixture.
Live heap after a mark-compact was no higher than main's (972 against 983
MB, `--trace-gc`), but after the fixture alone on HHS MEP the heap held 20
MB more (225 against 205 MB, after `gc()`). A heap snapshot diff put all of it
in 644,045 more retained "concatenated string" objects.

`step.mjs`'s `decodeStepString` built every STEP string a character at a
time (`out += c`). V8 keeps a string over 12 characters built that way as a
chain of cons strings, about 32 bytes a character, until something flattens
it. Running a regular expression over a string flattens it. Main's value
facets did that by chance: each one ran its pattern on every name and
description. Once those tests stopped running, the chains stayed in every
kept argument.

The decoder now returns a string with no `'` or `\` unchanged and copies
plain runs as one slice each. Over 300,000 random strings built from every
escape (`''`, `\\`, `\X\`, `\X2\`, `\X4\`, `\S\`, `\P?\`, with and without
their terminators) it gives the same output as the old decoder, errors
included. The fuzz script was not committed; `engine.test.mjs` gained two
mixed cases. With only the decoder fix, main's heap after the fixture is 190
MB instead of 205.

## Results

Reports are SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`). The IDS files are the 3 starter files and the 65 public
ones from `eval/fetch-audit-corpus.sh`; one public file is not a readable IDS
and fails the same way in every run. Models are from `opensourceBIM/IFC-files`
at `cb96c50` (fetch steps in `model-attr-codes-2026-11-17.md`). The federated
model is `eval/federate.mjs` over nine exports (steps in
`heap-200mb-2026-11-17.md`). "main" is `origin/main` at `8bd1b8ba4`; "decoder"
is main with this branch's `step.mjs` only. Node 22, 4 vCPU. Three runs each
(two on the federated model), all interleaved.

All 68 IDS files:

| model | main | decoder only | this change | reports |
|---|---|---|---|---|
| HHS MEP 39.6 MB | 4.1-4.5 s | 4.2 s | 2.9-3.1 s | identical |
| HHS architect 13.1 MB | 2.0-2.3 s | 2.0-2.2 s | 1.7-1.8 s | identical |
| HHS construction 3.9 MB | 0.8-1.0 s | 0.9-1.0 s | 0.8-0.9 s | identical |
| Schultz Residence 22.5 MB | 2.1-2.3 s | 2.1-2.4 s | 1.6-1.7 s | identical |
| federated 219 MB, 2 GB heap | 35.7-36.7 s, 1,708-1,711 MB RSS | 35.8-36.0 s | 28.4-29.6 s, 1,583-1,613 MB | identical |
| federated 219 MB, 1 GB heap | 49.3-51.5 s, 1,040-1,045 MB peak heap | 45.0-47.3 s, 1,021-1,022 MB | 35.4-36.6 s, 1,011-1,013 MB | identical |

The OpenAEC fixture alone on HHS MEP: 2.4 s to 1.1 s. Heap after it, after
`gc()`: 205 MB (main), 190 MB (decoder only), 190 MB (this change).

Attribute tests over the 68 files on HHS MEP (counted by wrapping the
prototype's methods): main ran `AttributeFacet.test` 2,851,787 times. This
change runs it 190,924 times and reads 665,224 shapes, one per entity.

Peak heap is sampled every 20 ms, so it is noisy on the small models. On HHS
construction both versions with the decoder fix sampled 105-110 MB against
main's 69 MB, and 203-212 MB RSS against 170-174. That model is small enough
for the collector to run late; the larger models and the capped runs show
the drop.

## Checks

- `node --test *.test.mjs`: every test passes (2 skipped, as before: they
  need fetched corpora).
- New `attribute-shape.test.mjs`. It runs 22 attribute facets on every entity
  of `samples/tiny-house.ifc` and of a small IFC4 file. The facets are any
  name, fixed names and name patterns, each with no value and with string,
  pattern, enum and number values, on lists, references and missing names.
  The small file has empty strings, unset, derived and empty-list
  attributes, geometry and all-scalar walls. Two passes check that every
  entity's cached verdict equals `test()`'s and that every shape occurs. More
  facets than slots are run, so eviction is covered: the slots listed by name
  must equal the kept slots. Then 66 specifications on every entity are
  checked against the uncached report.
- 12 planted faults. Each fails the new test or `applies-cache.test.mjs`:
  - a non-comparable shape passing;
  - an empty shape read as absent;
  - scalars passing without the value test;
  - empty attributes skipped;
  - a schema-derived attribute counted as set (the small file writes a value
    into `IfcSIUnit.Dimensions`);
  - every name sharing one key;
  - unset read as present;
  - every shape read as scalars;
  - the verdict byte returned unmasked;
  - the shape read from a sibling at the wrong bit;
  - an evicted slot left in the name list;
  - a sibling's shape replaced with the wrong one.

  One more fault, dropping the reference and typed-value check from `shape`,
  passed. It changes no verdict: the schema type check after it already marks
  those attributes as not comparable, as `test()` does.

## What is left

- Under a 1 GB heap the federated run peaks at 1,011-1,013 MB sampled. It
  fits, but with little room. What stays live during the OpenAEC fixture is
  mostly the model's kept arguments.
- The ifcXML reader decodes text with its own code (`xml.mjs`), which this
  change did not touch.
