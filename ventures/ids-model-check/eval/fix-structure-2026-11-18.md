# Repairing IDS files that break ids.xsd (2026-11-18)

`structure.mjs` (eval/ids-structure-2026-11-18.md) says where an IDS file
breaks buildingSMART's `ids.xsd`, and so where IfcTester, the IDS-Audit-tool
and other validating tools will refuse the whole file. 12 of 65 public IDS
files do. Most of those faults have exactly one right answer: IDS 0.9's
`minOccurs` belongs on `<applicability>` in 1.0, `IFC4X3` is spelt
`IFC4X3_ADD2`, the namespace is `http://standards.buildingsmart.org/IDS`. An
author should not have to make those edits by hand.

`fix.mjs` makes them. `fixStructure(text)` edits the file's own text in
place (comments, indentation, attribute order and prefixes stay as written),
lists each change with its line, and re-runs `structure.mjs` on the result to
say what is left for a person. On the page it is the **Download repaired
IDS** button under an audit with ids.xsd faults; on the command line,
`node cli.mjs --fix spec.ids -o spec-fixed.ids`.

## What it repairs

| fault | repair |
|---|---|
| a bare `&` (not well-formed XML) | `&amp;` |
| the schema's URL as the namespace (`.../IDS/1.0/ids.xsd`, `.../0.9.7/ids.xsd`), or none | `xmlns="http://standards.buildingsmart.org/IDS"` |
| `xs:` elements with no `xmlns:xs`; a `<restriction>` with no prefix | declared on the root; renamed `xs:restriction` with its facets |
| `ifcVersion="IFC4X3"` (or `_TC1`, `_ADD1`, lower case) | `IFC4X3_ADD2` |
| `minOccurs`/`maxOccurs` on `<specification>` (IDS 0.9) | moved to `<applicability>` |
| `minOccurs`/`maxOccurs` on a requirement facet (IDS 0.9) | `cardinality`, read the way the checker already read it |
| `<name>` in a property facet, `datatype` (IDS 0.9) | `<baseName>`, `dataType` |
| `dataType`, `cardinality`, `relation` in the wrong case | the case ids.xsd lists |
| a value written as bare text, `<name>IFCWALL</name>` | `<name><simpleValue>IFCWALL</simpleValue></name>` |
| children out of order (info fields, applicability facets, a facet's parts, applicability before requirements) | reordered, only when nothing but whitespace sits between them |
| an info `<date>` with a time | the date |

Left for a person, because no single answer is right: an `<author>` that is
not an e-mail address, an element ids.xsd does not have (`<n>` for `<name>`,
`<ids:invalid>`), a missing required element (an `<info>` block, a
classification's `<system>`), an unknown `ifcVersion` or `cardinality`.

## The reader now reads what IDS 0.9 files meant

Building this showed that the checker's own reader, which is lenient so a
0.9 file still runs, read three 0.9 forms as "anything":

- a property facet's `<name>` (1.0's `<baseName>`): the facet matched any
  property in the set;
- `datatype` (1.0's `dataType`): no type was required;
- a value written as bare text with no `<simpleValue>`: any value matched,
  and an entity facet `<name>IFCBUILDING</name>` applied to every class.

`ids.mjs` now reads them as their authors wrote them (structure.mjs still
reports each, as before, so the audit is unchanged). On the 139 public and
IDS-Audit-tool files the reader opens, 8 files read differently, all of them
public IDS files: 48 facets in which 57 fields (8 of them a dataType) had
been read as "anything". A model check of those 8 files could pass elements
their authors meant to fail. buildingSMART's suite is unchanged: 334 of 334,
strict 333 of 334 (`node eval/run-testcases.mjs`).

## Checks

`node eval/fix-structure.mjs OUT FILE...` runs the repair on each file,
writes the repaired copies, and checks two things the repair must never
break:

- a file with no ids.xsd fault comes back byte for byte;
- the checker reads the same specifications from the repaired copy as from
  the original (`parseIds`: every facet, value, cardinality and the
  specification's optionality; `IFC4X3` and `IFC4X3_ADD2` compared as one,
  as the checker matches them; applicability facets as a set).

The repaired copies are then validated with IfcTester's own `ids.xsd`
(`eval/ids-xsd-truth.py`, xmlschema 4.x).

| set | files | no fault, returned unchanged | with a fault | repaired (some or all) | same reading | valid by ids.xsd after |
|---|---|---|---|---|---|---|
| 65 public + 80 IDS-Audit-tool files (5 not XML) | 145 | 114 of 114 | 26 | 14 | 14 of 14 | 10 |
| mutated copies, seed 20261118, 6 each | 678 | 151 of 151 | 527 | 51 | 51 of 51 | 43 |
| mutated copies, seed 7, 10 each | 1,133 | 220 of 220 | 913 | 83 | 83 of 83 | 81 |
| mutated copies, seed 31, 10 each | 1,130 | 197 of 197 | 933 | 69 | 69 of 69 | 64 |

On every repaired copy, structure.mjs and ids.xsd give the same verdict (217
of 217). The mutation sets (`eval/ids-structure-mutate.py`) are mostly faults
with no single answer (an element dropped, doubled or renamed at random), so
few are repairable; what the repair takes on there is mostly order (176 of
the 203 mutation-set fixes).

**Public files.** Of the 12 public IDS files that break ids.xsd, 6 come back
valid (IDS 0.9 exports from CHEK and valitapp, the Spanish object norm,
the Finnish IBRO file with a bare `&`, an `IFC4X3` file). 4 more are left
with one or two faults a person must settle: two RulebookProcessing exports
whose author is "AI Assistant", a Molio example with a classification that
names no system, and a minimal file with no `<info>` and no
`<applicability>`. Two are untouched: one is not well-formed XML (an
unclosed element), one writes `<n>` for `<name>` throughout.

In passing, one rule of `structure.mjs` was wrong and is fixed:
`ifcVersion=""` was reported as invalid, but ids.xsd puts `minLength` on the
list's items, not the list, so an empty list is valid to it (a repaired
IDS-Audit-tool file showed it). The 145-file and three mutation sets still
agree with ids.xsd file for file (145, 678, 1,133 and 1,130).

## Reproduce

    sh eval/fetch-audit-corpus.sh
    python3 -m venv /tmp/xv && /tmp/xv/bin/pip install ifctester xmlschema
    shopt -s globstar
    node eval/fix-structure.mjs /tmp/fx eval/corpus/real/*.ids eval/corpus/IDS-Audit-tool/testing.shared/**/*.ids
    xargs -d '\n' /tmp/xv/bin/python eval/ids-xsd-truth.py < /tmp/fx/fixed.txt > /tmp/fx.jsonl
    node eval/ids-structure.mjs /tmp/fx.jsonl
    # mutated sets: as in eval/ids-structure-2026-11-18.md, then the same three lines on them
