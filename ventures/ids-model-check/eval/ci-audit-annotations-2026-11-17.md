# IDS audit warnings as CI annotations on the IDS file (2026-11-17)

`abstract-classes-2026-11-17.md` added the `class-abstract` audit warning (an
entity facet naming `IFCBUILDINGELEMENT` selects nothing, since IDS has no
inheritance) and left one item open: CI did not show audit warnings at all.
The text report, the page and the editor did; `ci-cli.mjs` and the GitHub
Action reported such a specification only as a failure ("required, but nothing
in the model matches the applicability") or a pass, with the reason buried in
`auditWarnings` in the JSON. The fix is in the IDS, so that is where the
annotation should land.

## What landed (`ci.mjs`, `ci-cli.mjs`, `action.yml`)

- `auditFindings(runs)`: the audit warnings of each IDS file and specification,
  once, however many models the IDS was checked against (they are about the
  IDS, not the model). `tally()` counts them (`auditSpecs`, `auditWarnings`).
- `idsSpecLines(text)`: the 1-based line of each `<specification>` start tag,
  in document order, skipping comments, CDATA and processing instructions and
  allowing a namespace prefix (`<ids:specification>`).
- `annotations()`: one `::warning file=<ids>,line=<spec line>` per specification
  with audit warnings, all its warnings in the message. An invalid
  specification's `::error` now carries the line too and is emitted once per
  IDS file (it was once per model); the not-checked-subclass warning also gets
  the line. Past nine audit annotations the rest fold into one annotation that
  says how many and points at the job summary: GitHub shows ten warnings per
  step and drops the others silently, and one real IDS has 19.
- Job summary: an "IDS audit" line and a per-IDS list of every warning. JUnit:
  each warning in the test case's `system-out`. Console: one line per warning.
- `--fail-on-audit-warnings` / `fail-on-audit-warnings: true` fails the build
  on them (annotations become errors); off by default, verdicts unchanged.
  New Action output `audit-warnings`.

## Measured

`node eval/ci-audit-annotations.mjs` on the files `eval/fetch-audit-corpus.sh`
and `eval/fetch-testcases.sh` fetch (this container, 2026-11-17). Each IDS is
checked against two models (`samples/tiny-house.ifc`, IFC4, and a one-wall
IFC2X3 file), as `--pairing all` pairs them:

| Set | Files | Specifications | Lines found | Tag on line is that spec | Specs with audit warnings | Audit annotations (2 models) | On the spec's line | Folded into the pointer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Real IDS from public repositories | 64 | 507 | 507 | 507 | 72 | 63 | 62 | 10 |
| IDS-Audit-tool ValidFiles | 12 | 288 | 288 | 288 | 0 | 0 | 0 | 0 |
| IDS-Audit-tool InvalidFiles | 35 | 322 | 322 | 322 | 8 | 8 | 8 | 0 |
| buildingSMART IDS test cases | 334 | 334 | 334 | 334 | 15 | 15 | 15 | 0 |

- **Placement:** 1,451 of 1,451 specifications found, and the start tag on
  each reported line is the specification `parseIds()` read in that position
  (its `name` attribute matches). No misses.
- **Once per IDS:** 72 + 8 + 15 annotated specifications from 190 model/IDS
  pairs' worth of reports; before deduplication two models would have doubled
  every one.
- **The cap:** 25 of the 64 real files have audit warnings. Rotterdam's
  "Vergunning Controle Service" IDS has 19 specifications with warnings: 9 are
  annotated on their lines and the other 10 fold into one pointer annotation
  (62 + 10 = 72). Every other file has 5 or fewer.
- **What they are** (real set, tiny-house model): 59 non-standard `Pset_`
  template findings (shown as warnings, since the specification still runs),
  56 property values with no `dataType`, 2 `class-abstract` (117 warnings on
  72 specifications) (the RVB BIM
  Norm's `IFCBUILDINGELEMENT`, both copies).
- The ValidFiles set stays at 0 warnings.

Run time for all 445 files and 890 checks: 0.5 s.

## Unchanged

Verdicts, exit codes and the JUnit pass/fail counts are unchanged unless
`--fail-on-audit-warnings` is given. The audit's own rules (`audit.mjs`) are
untouched.

## Open

- The page and the CLI text report show the warnings already; the BCF export
  does not (a BCF topic is about model elements, so an IDS finding has no
  natural viewpoint there).
- GitLab's code-quality report format would carry the same IDS-line findings
  for GitLab merge requests.
