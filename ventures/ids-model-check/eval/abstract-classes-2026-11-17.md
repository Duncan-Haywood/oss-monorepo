# Abstract classes in entity facets: an audit warning (2026-11-17)

`ci-unchecked-2026-11-17.md` left one item open: an entity facet naming an
abstract class with no concrete one listed. IDS 1.0 has no inheritance (an
entity facet matches objects whose own class is the one named), and an
abstract class is never an object's own class, so such a facet matches nothing.
On a model this reads as "required, nothing applicable", which looks like
"the model has no building elements" when the model has thousands.

## What landed

`audit.mjs`, code `class-abstract`, level **warning** (the IDS is valid, it just
cannot select anything, so the specification still runs and the verdict does
not change):

- **Applicability entity facet** listing class names (a simple value or an
  enumeration) where a name is abstract in a schema the specification is
  audited against. When every listed name matches nothing in a schema, the
  message says the specification applies to nothing (in those schemas'
  models) and, for a required one, that it fails on every such model. When
  another listed name is concrete, it says the facet matches only its other
  names. The message names the concrete classes below (first 8, then a count),
  which is the fix.
- **partOf entity** naming an abstract parent (`IFCSPATIALSTRUCTUREELEMENT`):
  never matches.
- Per schema: `IFCPROFILEDEF` is abstract in IFC2X3 but not IFC4, so an
  `IFC2X3 IFC4` specification is told "applies to nothing in IFC2X3 models",
  an IFC4-only one gets nothing.
- Not for class-name patterns (a pattern that also matches concrete classes is
  how an author asks for a family), and not for requirements: a required
  entity requirement naming an abstract class is already `entity-contradiction`.

The warning reaches the text report, the page and the IDS editor's live audit
(its "partOf: Of class" box takes any class name) through the existing
`auditWarnings` path.

## Measured

`node eval/abstract-classes.mjs` on the files `eval/fetch-audit-corpus.sh` and
`eval/fetch-testcases.sh` fetch (this container, 2026-11-17):

| Set | Files | Specifications | class-abstract |
|---|---:|---:|---:|
| Real IDS from public repositories | 64 (1 unreadable) | 507 | 2 facets, 2 specifications, 2 files |
| IDS-Audit-tool ValidFiles | 12 | 288 | 0 |
| IDS-Audit-tool InvalidFiles | 35 (4 unreadable) | 322 | 0 |
| buildingSMART IDS test cases | 334 | 334 | 0 |

The two hits are the two copies of the Dutch RVB BIM Norm v1.1 IDS
(OpenAEC-Foundation's BIM-validator and open-3d-viewer), specification 15,
"2.2.7.8a Element materiaal", required, applicability `IFCBUILDINGELEMENT`:
abstract in IFC2X3 and IFC4 and absent from IFC4X3 (renamed IfcBuiltElement,
which is concrete there). The message lists the 25 IFC2X3 classes below it.
That is the same specification `ci-unchecked-2026-11-17.md` found leaving
8,356 elements unchecked across 4 models; the audit now says so without a model.

No false positives: 0 warnings on 954 specifications from buildingSMART's
and the IDS-Audit-tool's own files.

## Unchanged

- `node eval/run-testcases.mjs`: 334 / 334, strict 333 / 334 (as before; the
  rule is a warning).
- `node eval/editor-roundtrip.mjs`: 203,433 specifications, 0 errors, 0
  warnings (the editor offers only concrete classes).
- `node --test *.test.mjs`: 138 pass (3 new in `audit.test.mjs`).

## Not done

- CI outputs (JUnit, annotations) carry the model-time "not checked" warning
  but not audit warnings in general; an audit-warning annotation on the IDS
  file is the next step there.
