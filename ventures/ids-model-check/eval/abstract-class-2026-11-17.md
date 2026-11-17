# Entity facets that name an abstract class (2026-11-17)

`ci-unchecked-2026-11-17.md` found two copies of the Dutch RVB BIM Norm v1.1
IDS (OpenAEC-Foundation's BIM-validator and open-3d-viewer) whose one
specification on `IFCBUILDINGELEMENT` applied to 0 elements on four real IFC2X3
exports while 8,356 building elements sat under that class. `IfcBuildingElement`
is ABSTRACT in IFC2X3 and IFC4, and IDS has no inheritance (an entity facet
matches an object's own class only), so the facet can never match anything, on
any model. It left open: "an audit rule ... it can never apply to anything, and
the audit could say so without a model". That rule landed here.

## The rule (`audit.mjs`, `abstractIssues`, code `class-abstract`)

A listed class name (simple value or enumeration; patterns are left alone) is
dead when every audited schema that knows it marks it abstract and, in IFC2X3,
it is not a key of buildingSMART's type mapping table (those names match
through the occurrence's type, so `IFCAIRTERMINAL` on an `IfcFlowTerminal`
still works).

| where | all listed names dead | some dead |
|---|---|---|
| applicability | warning: "the specification applies to no object" | warning: "that name matches nothing" |
| required entity requirement | **error**: every applicable element would fail (INVALID, as `entity-contradiction`) | warning |
| optional or prohibited entity requirement | warning | warning |
| `partOf` entity | warning: "it matches no object" | warning |

Each message lists the concrete subclasses to name instead (count and the first
8, the ones already listed left out), so the fix is in the message:

```
IFCBUILDINGELEMENT is abstract in IFC2X3 and IFC4: no object is ever of that
class itself, and IDS matches exact classes (no subclasses), so the
specification applies to no object; list its concrete subclasses instead (36:
IFCBEAM, IFCBEAMSTANDARDCASE, IFCBUILDINGELEMENTPART, IFCBUILDINGELEMENTPROXY,
IFCCHIMNEY, IFCCOLUMN, IFCCOLUMNSTANDARDCASE, IFCCOVERING, ...)
```

The applicability case stays a warning on purpose: the IDS is valid against
ids.xsd and IfcTester runs it the same way (exact class match), and a model run
still reports, through `skippedSubclasses`, which of the model's elements the
facet missed. The required-requirement case is an error for the same reason
`entity-contradiction` is one: the check could only report every element as
failing for a fault in the IDS.

Abstract classes in the bundled schemas: IFC2X3 97 of 653, IFC4 123 of 776,
IFC4X3 133 of 876.

## Measured

| | before | after |
|---|---|---|
| buildingSMART IDS suite at `870f9c4` (`eval/run-testcases.mjs`) | 334 / 334, strict 333 / 334 | identical output (diffed) |
| IDS-Audit-tool ValidFiles read as invalid (`eval/audit-corpus.mjs`) | 1 of 9 | 1 of 9 (same file, `attribute-unknown`) |
| IDS-Audit-tool InvalidFiles flagged | 17 of 35 | 17 of 35 |
| 65 public IDS files: errors by code | (see script) | identical |
| 65 public IDS files: `class-abstract` warnings | n/a | **2** (both RVB BIM Norm v1.1 copies) |
| editor round trip (`eval/editor-roundtrip.mjs`): 203,433 offered specifications | 0 errors, 0 warnings | 0 errors, 0 warnings |

So the corpus has exactly the one known case, now caught from the IDS alone,
with no model. No other public file names an abstract class; the editor never
offers one (it lists non-abstract classes only).

`node --test *.test.mjs` in the venture: 137 pass, 1 skipped (one new test in
`audit.test.mjs` covering the applicability warning and its subclass list, the
required-requirement error, optional requirement as warning, a mixed
enumeration, a `partOf IFCSPATIALSTRUCTUREELEMENT`, and the type-mapping
exception).

## Not done

- Patterns are not checked: a pattern matching only abstract names
  (`IFCBUILDING.*ELEMENT`) is the same fault and could get the same warning.
- The editor shows the audit warning on an opened file but has no one-click
  "replace with the concrete subclasses" button yet; the subclass button it
  already has (`modelSubclassesLeftOut`) works only when a model is open.
