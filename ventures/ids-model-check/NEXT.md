# ids-model-check: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-17) a BIM coordinator's real IDS and model (needs a person)
- (2026-11-17) the GitHub Action: a run on a GitHub runner and a team's repo
- (2026-11-17) landed, kept for reference: the CI runner parses each model once and caps failures per spec (eval/ci-scale-2026-11-17.md)
- (2026-11-17) heap 2026-11-17 (eval/heap-200mb-2026-11-17.md: 219 MB model 2.5 to 1.0 GB); specs applying to every entity 2026-11-17 (eval/no-entity-facet-2026-11-17.md: 68 public IDS 515 to 111 s on 219 MB, 96 to 13 s on HHS MEP, reports identical; the 4.7 GB peak was uncollected garbage, 2 GB suffices). Next: lazy ifcXML; attribute-pattern value requirements still parse geometry
- (2026-11-17) GitHub Action and ci-cli.mjs 2026-11-17 (eval/ci-action-2026-11-17.md: 8 pairs on 4 real exports in 7.5 s, 9 of 9 annotations on the element's line)
- (2026-11-17) date and duration ranges 2026-11-17 (eval/date-ranges-2026-11-17.md: IfcTester 0.9.0 fails every object on a date range, Write as a pattern agrees 10 of 10; 86.4% of public facets editable)
- (2026-11-17) a dataType-mismatch hint, Accept any data type 2026-11-17 (eval/model-any-type-2026-11-17.md)
- (2026-11-17) a range for numeric attributes
- (2026-11-17) attribute values and classification codes 2026-11-17 (eval/model-attr-codes-2026-11-17.md: 242 of 242 offers pass; 143 of 210 Uniformat elements in Schultz have an empty code, Require a code)
