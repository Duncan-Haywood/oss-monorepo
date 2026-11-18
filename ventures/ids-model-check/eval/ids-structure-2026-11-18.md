# IDS file structure against ids.xsd (2026-11-18)

The README's Limitations said: "The IDS audit does not validate the file
against the IDS XML schema (cardinality attributes, element order); the
IDS-Audit-tool does." A file that breaks `ids.xsd` is refused whole by tools
that validate first (IfcTester with `validate=True`, the IDS-Audit-tool, some
authoring-tool plug-ins), while this checker's reader is lenient and read it
anyway, so the page said VALID to a file the next tool in the chain rejects.

`structure.mjs` now checks what a schema validator checks, written out from
`ids.xsd` 1.0.0 (the copy bundled with IfcTester): which elements may appear
where, in what order and how many times; which attributes each element may
carry (and which it must); the fixed lists (`cardinality`, `relation`,
`ifcVersion`, `dataType` in capitals); `<simpleValue>` or `<xs:restriction>`
as the only content of a value; XSD 1.0 facets only inside a restriction
(`xs:assertion` is XSD 1.1), values in the facet's `value` attribute; the info
block's `author` (e-mail) and `date` (xs:date); the root's namespace; and a
bare `&`, which the reader tolerated but no XML parser does. Each finding
names the line, the element and what to write instead.

## Same verdict as IfcTester's validator

Ground truth: `eval/ids-xsd-truth.py`, which runs `xmlschema` with the
`ids.xsd` bundled in IfcTester (pip `ifctester`, `xmlschema` 4.x) on each
file. Compared per file (valid or not) by `node eval/ids-structure.mjs`.

| set | files | same verdict | invalid by ids.xsd |
|---|---|---|---|
| 65 public IDS files + 80 IDS-Audit-tool test files (`eval/fetch-audit-corpus.sh`) | 145 | 145 | 31 |
| mutated copies of the 114 valid ones, seed 20261118, 6 each | 678 | 678 | 549 |
| mutated copies, seed 7, 10 each | 1,128 | 1,128 | 898 |
| mutated copies, seed 31, 10 each (not looked at until the rules were final) | 1,129 | 1,129 | 891 |

The mutations (`eval/ids-structure-mutate.py`) are the kinds of fault real
files show: two siblings swapped, an element dropped, doubled or renamed, an
attribute added in the wrong place or misspelt, a fixed-list attribute given a
wrong value, text where elements belong. The rules were fixed on the first two
sets. The first set's first run disagreed on 8 of 678 (text inside an
`xs:` facet, a `base` that is not a type name); the seed-7 set then found 2 more
(children of `xs:annotation`); the seed-31 set was run once, after, and agreed
on all 1,129. The check is verdict per file, not every message: where a file
breaks the schema in several places, `xmlschema` stops at fewer than this
reports.

## What it finds in public IDS files

12 of the 65 public IDS files break `ids.xsd` (one is not XML a parser reads
at all, the bare `&`; two more are two RulebookProcessing exports):

| fault | files |
|---|---|
| `minOccurs`/`maxOccurs` on `<specification>` (IDS 0.9; 1.0 puts them on `<applicability>`) | 3 public, 2 audit-tool |
| root namespace is the schema's URL (`.../IDS/1.0/ids.xsd`) or none | 3 |
| `<author>` not an e-mail address ("AI Assistant") | 2 |
| `ifcVersion="IFC4X3"` (1.0 says `IFC4X3_ADD2`) | 1 public, 1 audit-tool |
| `<n>` for `<name>` inside an entity facet | 1 |
| a bare `&` in the title | 1 |
| not well-formed (an unclosed element) | 1 |

`node eval/audit-corpus.mjs`: the IDS-Audit-tool's invalid files read as
invalid go from 17 to 20 of 35; its valid files read as invalid stay at 1 of 9
(`IDS_aachen_example.ids`, an unknown attribute, as before). buildingSMART's
test suite (`node eval/run-testcases.mjs`) is unchanged: 334 of 334, strict
333 of 334. The editor's own files raise nothing (`eval/editor-xsd-sample.mjs`,
3 files, 15,102 specifications).

## How findings are reported

- **Audit** (page button "Audit the IDS only", `node cli.mjs --audit`): an
  error each, under the specification it is in (or "IDS file"), with
  `line N`. A finding the audit already makes in its own words (a partOf
  relation, an unknown ifcVersion, a classification with no system) is kept
  once, in the audit's words. Capped at 200 per file plus one "N more" line:
  a 5.6 MB file with every `<simpleValue>` wrapper removed has 51,952.
- **Model check**: the specification still runs, because the reader still
  knows what the author meant (IDS 0.9's `minOccurs` on the specification
  is read as before); the finding is a warning, "not valid IDS 1.0, so
  validating tools refuse the file". So no verdict in any earlier report
  changes; the CI annotations and job summary list them with the other audit
  warnings.

Time: 135 ms on the 5.6 MB editor sample (parse 172 ms), 3.5 ms on the
largest public file (38 KB).

## Not covered

- `ids.xsd` imports `XMLSchema.xsd` for `xs:restriction`; facet values are
  checked for form where it is short (lengths, digits, whiteSpace), not
  every XSD rule (a `pattern` that is not a valid XSD regular expression is
  the audit's job and is checked there).
- IDS 0.9.x files are judged against 1.0, as IfcTester does.

## Reproduce

    sh eval/fetch-audit-corpus.sh
    python3 -m venv /tmp/xv && /tmp/xv/bin/pip install ifctester xmlschema
    /tmp/xv/bin/python eval/ids-xsd-truth.py eval/corpus/real/*.ids eval/corpus/IDS-Audit-tool/testing.shared/**/*.ids > truth.jsonl   # bash: shopt -s globstar
    node eval/ids-structure.mjs truth.jsonl
    SEED=31 python3 eval/ids-structure-mutate.py /tmp/mut truth.jsonl 10
    /tmp/xv/bin/python eval/ids-xsd-truth.py /tmp/mut/*.ids > mtruth.jsonl && node eval/ids-structure.mjs mtruth.jsonl
