# 65 public IDS files on four real exports, against IfcTester (2026-11-17)

**Question.** The IfcTester cross-checks so far (README, "How it was checked",
2) used this repository's own IDS files. Do this checker and IfcOpenShell's
IfcTester agree when the IDS files are the ones people actually publish, on
real authoring-tool exports? Where they disagree, which one is right, and
what does a user need to be told?

## Setup

- IDS: the 65 public files `eval/fetch-audit-corpus.sh` fetches
  (`eval/real-ids-files.txt`, each repository's HEAD on 2026-11-17).
- Models: the four exports from `opensourceBIM/IFC-files` at `cb96c50`
  (HHS Office MEP 39.6 MB, architect 13.1 MB, construction 3.9 MB, all IFC2X3;
  OpeningDesign's Schultz Residence 22.5 MB, IFC2X3 Revit; fetch steps in
  `model-attr-codes-2026-11-17.md`). 260 model/IDS pairs.
- IfcTester 0.9.0 with ifcopenshell 0.9.0.post1 from PyPI.
- Scripts (new):

```
node --max-old-space-size=8192 eval/corpus-crosscheck.mjs MODELS eval/corpus/real ours.jsonl
python3 eval/corpus_crosscheck_ifctester.py MODELS eval/corpus/real theirs.jsonl   # one model dir per run is fine
python3 eval/corpus_crosscheck_compare.py ours.jsonl theirs*.jsonl --detail
```

Each parses a model once and writes every specification's verdict,
applicable count and full set of failing element ids (no cap). "Same" means
all three agree.

## Result

IfcTester could not open 12 of the 65 files (8 fail its XSD validation, 2
use an older or misspelled namespace, 2 are not well-formed XML). This
checker reads 64 (the 65th, `A3_IDS.ids`, is not well-formed: an unclosed
`<numeric>`); it runs the 8 schema-invalid ones as written (its audit
does not validate against `ids.xsd`; README, Limitations).

On the 53 files both ran, 4 models:

| Model | Specifications compared | Identical | Different |
| --- | ---: | ---: | ---: |
| HHS MEP | 434 | 430 | 4 |
| HHS architect | 434 | 427 | 7 |
| HHS construction | 434 | 427 | 7 |
| Schultz Residence | 434 | 377 | 57 |
| **total** | **1,736** | **1,661** | **75** |

Every one of the 75 differences has one of three causes:

| Cause | Results | Which reading the standard takes |
| --- | ---: | --- |
| `IFCWALL` and `IfcWallStandardCase` in IFC2X3 | 50 (Schultz) | this checker's (below) |
| a prohibited specification with requirements | 16 | this checker's: buildingSMART's `ids/invalid-prohibited_specifications_invalid_if_requirements_are_specified` |
| `IsExternal = True` with no dataType | 9 | not settled; the audit already warns (`untyped-values-2026-11-17.md`) |

### 1. IfcWallStandardCase is not an IfcWall to IDS, and both checkers miss walls

Revit's IFC2X3 exports write most walls as `IfcWallStandardCase`. The IDS
user manual (entity facet, "Inheritance"): "There is no automatic inheritance
in IDS entity facet interpretation." So an IDS naming `IFCWALL` takes the
Schultz Residence's 4 `IfcWall`s and none of its 101 `IfcWallStandardCase`s.
IfcTester, in IFC2X3, also matches an occurrence whose *type object* is an
`IfcWallType` (`facet.py`, `Entity.__call__`: it strips `TYPE` from any type
class), which goes beyond buildingSMART's 57-row IFC2X3 mapping table; the
Schultz walls are typed, so IfcTester counts 105 walls where this checker
counts 4.

The HHS models' 112 `IfcWallStandardCase`s have no type object. There both
checkers agree, and **both skip every one of them**: 51 specification results
per HHS model where the two tools match exactly and neither looked at most of
the walls. A specification on walls' fire rating can pass on a model whose
walls carry none.

**What landed** (`ids.mjs`, `skippedSubclasses`): the verdict stays as the
standard reads it; each specification now counts the elements an entity facet
leaves out only because it names an ancestor of their class (every other
applicability facet, and the predefined type, would take them), and the
report says so:

```
[FAIL] Wall Fire Rating Check (optional)
  applies to: entity "IFCWALL"  -> 4 element(s)
  warning: not checked: 101 element(s) of subclasses the entity facet does not name:
    101 IFCWALLSTANDARDCASE (a subclass of IFCWALL). IDS entity names do not include
    subclasses; add these class names to the entity facet to check them
```

The page shows it under the specification, `--json` carries
`skippedSubclasses` per specification.

Across the 260 pairs, 165 of 2,028 specification results now carry the
warning, in 25 of the 64 files; **76 of them are a PASS** that left elements
unchecked (20 on HHS architect, 27 on construction, 29 on Schultz).

| Class the entity facet names | Subclasses left out | specification results |
| --- | --- | ---: |
| IFCWALL | IFCWALLSTANDARDCASE | 157 |
| IFCBUILDINGELEMENT (abstract: no element can be one) | walls, slabs, doors, columns, proxies and up to 15 more | 8 |

Elements reported unchecked: 1,148 (MEP), 10,944 (architect), 2,566
(construction), 6,747 (Schultz) summed over specifications.

On the 50 Schultz differences, ours applicable plus the elements the warning
counts equals IfcTester's applicable in all 50.

### 2. A prohibited specification with requirements

Four public files (OpenAEC's NL-BIM Basis ILS and RVB BIM Norm, two copies
each) forbid `IfcBuildingElementProxy` with a prohibited spec that also has a
requirement. buildingSMART's test suite says that IDS is invalid, so this
checker reports INVALID and does not run it; IfcTester runs it and fails 574
proxies on MEP, 85 on architect, 146 on Schultz. Read as a report, INVALID
with "0 applicable" looked like a clean model. Now the invalid note adds
`85 element(s) in this model match its applicability and would fail it once
the requirements are removed` (`matching` in JSON); in all 16 results that
count equals IfcTester's.

### 3. `True` on an untyped boolean

`Pset_WallCommon.IsExternal = True` with no dataType (OpenAEC's files,
openingbim-cicd's Basic IDM Check): IfcTester matches it to the boolean, this
checker does not (XSD's boolean is `true`/`false`/`1`/`0`), so 0 against
32-122 applicable. Unchanged here; the audit already flags it on these files
("checkers disagree"), and the editor writes `IFCBOOLEAN`/`true`.

## Verified

- Verdicts, applicable counts and failing sets: identical before and after
  the change on all 2,028 results (`ours-before` against `ours-after`).
- buildingSMART's suite: 334 / 334, strict 333 / 334, as on main.
- `node --test` in the venture: 124 then 126 tests pass (two new in
  `engine.test.mjs`).
- Time: 134 s before, 140 s after, for the 260 pairs (the walk over a model's
  classes per specification; the test per element runs only on subclasses).

## Not done

- CI outputs (JUnit, annotations, step summary) do not carry the warning yet;
  the text, JSON and page reports do.
- The IDS editor could offer `IFCWALLSTANDARDCASE` next to `IFCWALL` when the
  loaded model has them.
