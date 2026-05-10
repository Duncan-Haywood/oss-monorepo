# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Implementation continuation note - 2026-05-10 22:30 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-2cbd` from the consolidated package
reportability head on `origin/main` (`5c498c6`). Local `main` was still stale at
the initial commit until the reconciliation phase, so `origin/main` remained the
canonical base.

The highest-value scoped continuation was the native-shell safety bridge left by
the previous run:

- Added `python -m shootflow.cli package-handoff-brief --ingest-manifest <path>`.
- The command is read-only. It reloads the trusted ingest manifest, rebuilds the
  production plan, validates matching `production_status.json` and
  `production_scheduler_report.json`, summarizes completed/review-required
  package jobs plus materialized package outputs, and returns disabled
  copy/retry/materialization controls derived from the scheduler report's
  observe-only `workflow_authority`.
- Review found an important edge case: a later no-op scheduler run can write a
  valid report with `outputs_materialized: []` even though package outputs remain
  succeeded in trusted production status. The brief now derives current package
  readiness/output paths from the final trusted status while still binding
  controls to scheduler report authority.
- Updated README, AGENTS, product strategy, business plan, design decisions, and
  workflow authority docs with the package handoff bridge contract.

Branch reconciliation findings:

- Fetched `origin/main` and the assigned branch.
- The only remote branches ahead of `origin/main` were this assigned branch and
  `origin/cursor/branch-consolidation-strategy-22ea`.
- `origin/cursor/branch-consolidation-strategy-22ea` mostly duplicated or
  regressed current named-entry package reportability (its implementation branch
  only named flat `extra.bin`, while current main already handles nested
  `nested/extra.txt` and stronger scheduler/report coverage). It was not merged
  wholesale.
- One useful unique test from that branch was integrated directly:
  scheduler/report coverage for storyline checksum drift before package
  materialization. A drifted `analysis/instagram_storylines.json` now has
  persisted scheduler proof that the package job becomes retryable, outputs stay
  absent, and the checksum-mismatch message survives in the report.

Verification performed during this run:

- Red command-surface check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowRenderTaskCliTests.test_package_handoff_brief_reads_scheduler_report_and_disables_controls`
  failed because `package-handoff-brief` did not exist.
- Focused green after implementation: the same test -> OK.
- Review-regression red:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowRenderTaskCliTests.test_package_handoff_brief_uses_final_status_after_noop_scheduler_report`
  failed with `not_ready != ready` because the brief trusted the latest report's
  empty `outputs_materialized` rather than final status checksums.
- Focused green after fix:
  package-brief focused tests -> 2 tests OK.
- Reconciled package drift coverage:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler.DryRunProductionSchedulerTests.test_package_adapter_scheduler_reports_story_checksum_drift tests.test_production_scheduler.DryRunProductionSchedulerTests.test_package_adapter_scheduler_names_unexpected_directory_entries`
  -> 2 tests OK.
- Final verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowRenderTaskCliTests.test_package_handoff_brief_reads_scheduler_report_and_disables_controls tests.test_cli.ShootFlowRenderTaskCliTests.test_package_handoff_brief_uses_final_status_after_noop_scheduler_report tests.test_production_scheduler.DryRunProductionSchedulerTests.test_package_adapter_scheduler_reports_story_checksum_drift && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli tests.test_production_scheduler && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 3 focused tests OK, 99 CLI/production-scheduler tests OK, 438 total tests
  OK; compileall and diff-check exited 0.
- Independent code review first found the no-op report readiness bug above; the
  final review after the fix reported no actionable correctness/safety findings.

Good next test-first targets:

- Add a package handoff brief review-required case if native shells need a
  direct readout for retryable package jobs alongside the ready/no-op cases.
- Start replacing `package-production-local`, `grade-production-local`, and
  `proxy-production-local` stand-ins with real ffmpeg/Core Image/Metal workers
  behind the same declared-output-only, checksum-verified boundaries.
- When a SwiftUI/menu-bar shell appears, bind its package panel to
  `package-handoff-brief` and keep all adjacent copy/retry/materialization
  controls disabled unless a separate reviewed action contract exists.

## Implementation continuation note - 2026-05-10 22:00 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-7c58` at `ef0d941`, matching
`origin/main`. The assigned remote branch did not exist at session start. Local
`main` was still stale at the initial commit, so branch reconciliation should
treat `origin/main` as the canonical base for this run.

The highest-value continuity gap was a useful package-stage reportability
follow-up recorded in automation memory but not present in this checkout:

- Existing directory-style package outputs with unplanned entries already became
  retryable review states, but the adapter and persisted scheduler report only
  emitted a generic "unexpected package production directory entry" message.
- This run adds named-entry reportability: retryable package adapter errors now
  include stable relative entry names such as `extra.bin` and
  `nested/extra.txt`, while preserving those stray bytes and still refusing to
  trust the package directory as materialized output.
- Added direct adapter coverage for multiple/nested unexpected entries and
  scheduler/report coverage for malformed photo-only carousel plus photo-set
  package directories. Both package jobs become retryable, outputs are not
  materialized/trusted, product metrics count the two retryable failures, and
  persisted failure messages name the unexpected entries for native UI review.
- Updated AGENTS, README, product strategy, business plan, and design decisions
  with the named-entry package reportability contract.

Verification performed during this run:

- Red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_rejects_existing_directory_with_unplanned_extra_file tests.test_production_scheduler.DryRunProductionSchedulerTests.test_package_adapter_scheduler_names_unexpected_directory_entries`
  failed because retryable package errors did not include `extra.bin`.
- Focused green after implementation: the same command -> 2 tests OK.
- Related production suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 101 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 435 tests OK; compileall and diff-check exited 0.

Branch reconciliation findings:

- Fetched `origin/main` and the assigned branch. The assigned branch was one
  commit ahead of `origin/main` with this package reportability work.
- Local `main` remained stale at the initial commit until final reconciliation.
- The only other remote branch ahead of `origin/main` was
  `origin/cursor/branch-consolidation-6dc9` (ahead 2, behind 1). Its net diff
  would remove current scheduler/report package coverage and roll back to an
  older package-adapter shape, so it was intentionally not merged.
- After verification, local `main` was fast-forwarded from stale local history to
  `origin/main`, then through this assigned branch, and `origin/main` was pushed
  to the same head as `cursor/branch-reconciliation-and-merge-7c58`. Final
  reconciliation showed local/remote main and local/remote assigned branch all at
  `2e5dc6a`; `origin/cursor/branch-consolidation-6dc9` remained intentionally
  unmerged and was then behind 3/ahead 2 against the consolidated main.

Good next test-first targets:

- Start a native-shell bridge proof that reads completed package scheduler
  reports and binds copy/retry/materialization controls to
  `workflow_authority`/`handoff-controls` fail-closed state.
- Replace `package-production-local`, `grade-production-local`, and
  `proxy-production-local` stand-ins with real ffmpeg/Core Image/Metal/render
  workers behind the same declared-output-only and checksum-verified boundary.

## Implementation continuation note - 2026-05-10 20:00 UTC

This run started on assigned branch
`cursor/repository-branch-consolidation-54cb` at `acc4f70`, matching
`origin/main` and the prior story-adapter continuation head. Local `main` was
still stale at the initial commit and was handled during branch reconciliation.

Branch reconciliation findings before implementation:

- Fetched `origin/main` and compared local/remote refs against it. The assigned
  branch matched `origin/main` at session start.
- Historical remote automation branches were behind `origin/main` and had no
  unique commits to merge, except
  `origin/cursor/branch-consolidation-6517`, which was one commit ahead and four
  commits behind `origin/main`.
- The unique `origin/cursor/branch-consolidation-6517` diff was a
  `docs/CONTINUATION_NOTES.md`-only "Branch consolidation note - 2026-05-10
  19:00 UTC" that described stale/deleted branch state and would have omitted
  the current story-adapter implementation commits. It was intentionally not
  merged because it added no current implementation, product, or architecture
  value beyond these canonical notes.

This run closed the primary post-story handoff left by the 19:00 UTC note:

- Added `package-production-local` as a stage-specific production adapter for
  `instagram_reel`, `instagram_carousel`, and `instagram_photo_set` jobs.
- The adapter claims/finalizes through the existing guarded
  `production_status.json` compare/write path, verifies trusted storyline plus
  graded dependency outputs against succeeded status checksums, and writes only
  declared package outputs.
- File-style package outputs receive deterministic JSON handoff artifacts.
  Directory-style package outputs receive a controlled `package_manifest.json`
  plus a deterministic directory checksum through the production-worker checksum
  path, allowing persisted scheduler reports to count package materialization
  without treating directories as cleanup authority.
- Existing package directories are accepted only when they contain exactly the
  deterministic `package_manifest.json`; a matching manifest plus unplanned
  extra files now becomes a retryable review state instead of trusting stray
  bytes as production output.
- Added direct adapter coverage for reel file output, carousel directory output,
  missing-story retryability, unexpected existing directory entries, and batch
  dispatch, plus scheduler/report coverage proving package materialization is
  visible in persisted production scheduler metrics.
- Updated CLI help, AGENTS, README, product strategy, business plan, and design
  decisions so the current canonical production chain is
  proxy -> analysis -> scene -> look -> grade -> story -> package.

Verification performed during this run:

- Red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_writes_deterministic_reel_from_trusted_story_and_grades tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_materializes_directory_package_with_directory_checksum tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_marks_missing_story_dependency_retryable_without_output tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_batch_runs_ready_actions_through_same_contract`
  failed because `run_package_production_action` was missing.
- Focused green after implementation: the same package adapter tests -> 5 tests
  OK.
- Review found a blocking directory-safety issue: an existing package directory
  with a matching `package_manifest.json` plus extra files could be accepted and
  checksummed as trusted output. Added a regression that failed with a succeeded
  status, then fixed existing-directory validation so it becomes retryable
  without deleting or modifying the extra file.
- Focused regression green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_rejects_existing_directory_with_unplanned_extra_file tests.test_production_adapter.DryRunProductionAdapterTests.test_package_adapter_materializes_directory_package_with_directory_checksum`
  -> 2 tests OK.
- Related production suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 100 tests OK.
- Full verification before reconciliation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 434 tests OK, compileall and diff-check exited 0.
- Independent review (`code-reviewer` subagent) found no remaining blocking
  correctness or safety issues after the directory regression fix.

Good next test-first targets:

- Add negative scheduler/report coverage for package dependency checksum drift
  and malformed existing package directories if the Mac UI needs explicit
  persisted-report proof for those review states.
- Replace `package-production-local` with real ffmpeg/Core Image/Metal/renderer
  package workers behind the same trusted storyline/graded dependency and
  declared-output-only boundary.
- Start a native-shell bridge proof that can read the completed
  proxy -> analysis -> scene -> look -> grade -> story -> package scheduler
  reports and present first-draft package readiness while binding write-capable
  controls to `workflow_authority`.

## Implementation continuation note - 2026-05-10 19:00 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-62ae` at `3c197cc`, matching
`origin/main` and the previous grade-look reconciliation head.

Branch reconciliation findings:

- Fetched `origin/main` and compared all local and remote refs against it before
  implementation. The assigned branch and `origin/main` initially matched.
- The only other remote branch ahead of `origin/main` was
  `origin/cursor/branch-consolidation-strategy-1e40`, one commit ahead and eight
  commits behind at the beginning of the run. Its unique diff remained only the
  stale branch-consolidation continuation-note content already rejected by prior
  runs, so it was intentionally not merged.
- After implementation, local `main` was fast-forwarded from the stale initial
  commit through `origin/main`, then fast-forwarded through the assigned branch
  commits and pushed to `origin/main`. A final branch comparison after pushing
  main showed no useful implementation branch ahead of `origin/main`; only the
  same stale `origin/cursor/branch-consolidation-strategy-1e40` note branch
  remained ahead/behind and unmerged for the same reason.

This run closed the primary post-grade handoff left by the 18:30 UTC note:

- Added `story-production-local` as a stage-specific production adapter for
  `storyline_selection` jobs.
- The adapter claims/finalizes through the existing guarded
  `production_status.json` compare/write path, verifies every planned story
  input artifact (analysis, scene groups, shoot look, and graded outputs)
  against succeeded trusted-status checksums, then writes only the declared
  schema v2 `analysis/instagram_storylines.json` output.
- Missing or unsafe dependencies become retryable review states without
  deleting, cleaning up, overwriting, or inventing media paths.
- Added `storyline_artifact_bytes(...)` so adapters can reuse the existing
  storyline schema/validation without calling the artifact writer that replaces
  files directly.
- Added direct action coverage for successful storyline materialization and a
  missing graded dependency, plus batch-dispatch coverage proving
  `run_production_adapter_batch(...)` routes `story-production-local` through
  the same adapter contract.
- Updated CLI help, AGENTS, README, product strategy, business plan, and design
  decisions so the current canonical production chain is proxy -> analysis ->
  scene -> look -> grade -> story, with package work still pending a compatible
  future adapter.

Verification performed during this run:

- Red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_story_adapter_writes_deterministic_storylines_from_trusted_grade_outputs tests.test_production_adapter.DryRunProductionAdapterTests.test_story_adapter_marks_missing_grade_dependency_retryable_without_output`
  failed because `run_story_production_action` was missing.
- Focused green after implementation:
  the same three story adapter tests -> 3 tests OK.
- Full adapter verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter`
  -> 53 tests OK before the batch-dispatch follow-up, then 55 tests OK after
  adding the story batch test.
- Related/full verification before docs commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_story tests.test_cli tests.test_production_scheduler && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 160 related tests OK, 428 full tests OK, compileall and diff-check exited
  0.
- Independent review (`code-reviewer` subagent) found no correctness, safety, or
  contract issues. It identified the missing batch-dispatch story adapter test,
  which this run added and verified.
- Reconciliation verification on `main` before pushing:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests`
  -> 428 tests OK, then `origin/main` was fast-forwarded to `4026cb2`.

Good next test-first targets:

- Register a deterministic package/deliverable production adapter that consumes
  trusted storyline and graded outputs only through declared package job outputs,
  while preserving directory-output safety and no-overwrite semantics.
- Add scheduler-level story adapter coverage if native Mac UI/report surfaces
  need explicit persisted-report proof that story jobs complete and package jobs
  remain pending for a compatible worker.
- Replace `story-production-local` with real editorial/story intelligence behind
  the same checksum-verified input boundary, preserving the existing schema v2
  storyline artifact until a deliberate schema migration is planned.
- Continue replacing local stand-ins with real ffmpeg/Core Image/Metal and VLM
  workers only behind the already-tested declared-output-only contracts.

## Implementation continuation note - 2026-05-10 18:30 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-478e` at `3eb7dcf`, matching
`origin/main` and the prior completed grade-analysis handoff validation.

Branch reconciliation findings:

- Fetched `origin/main` and compared all local and remote refs against it.
- The only implementation branch ahead of `origin/main` was the assigned branch,
  with two commits: `58c44b9 fix(production): validate grade look handoff` and
  `d1b9eaa test(production): reject signed look dependency checksums`.
- The only other remote branch ahead was
  `origin/cursor/branch-consolidation-strategy-1e40`, which was also five
  commits behind `origin/main` and contained only a stale
  `docs/CONTINUATION_NOTES.md` branch-consolidation note. It was intentionally
  not merged because its unique diff did not add product, architecture, test, or
  implementation value beyond the current canonical notes.
- Local `main` was stale at session start. Reconciliation fast-forwarded local
  `main` to `origin/main`, then fast-forwarded it through the assigned branch
  commits before this continuation-note update.

This run closed the smaller grading reliability follow-up left by the 18:00 UTC
note:

- Added direct adapter coverage proving `grade-production-local` treats
  checksum-matching but malformed look payloads as retryable review states
  without materializing graded outputs.
- Hardened the grade adapter's look dependency parser so it now requires the
  deterministic look payload's `source_scene_groups` object, source-scene
  checksum shape, scene/analysis counts, scene-label/tag lists, and
  `look_profile` tone/color/score fields before using the look handoff.
- Review found that `int(sha256, 16)` accepts leading `+`/`-` signs, so this run
  added a regression for a signed 64-character source-scene checksum and changed
  validation to require exactly 64 hexadecimal characters.
- Updated product and architecture docs so grade dependencies are described as
  schema-validated/checksum-verified for both analysis and look artifacts.

Verification performed during this run:

- Red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_look_dependency_retryable`
  failed because malformed look payloads still produced succeeded grade jobs.
- Focused green after implementation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_look_dependency_retryable tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_writes_deterministic_grade_from_trusted_dependencies tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_analysis_dependency_retryable`
  -> 3 tests OK.
- Full adapter verification before the first commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter && git diff --check`
  -> 51 tests OK and diff-check exited 0.
- Review regression red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_look_dependency_retryable`
  failed for the signed SHA-256 case before the exact-hex fix.
- Review regression green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_look_dependency_retryable tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_writes_deterministic_grade_from_trusted_dependencies && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter && git diff --check`
  -> 2 focused tests OK, 51 adapter tests OK, and diff-check exited 0.
- Final pre-reconciliation verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 91 related production tests OK, 425 full tests OK, compileall and
  diff-check exited 0, and the assigned branch working tree was clean.

Good next test-first targets:

- Register a deterministic `story-production-local` adapter now that grade
  artifacts are bound to schema-validated/checksum-verified analysis and look
  handoffs.
- Add scheduler-level coverage for malformed look payloads if the Mac UI/report
  surface needs an explicit persisted-report proof mirroring the existing
  malformed-analysis scheduler coverage.
- Replace the grade and proxy stand-ins with real ffmpeg/Core Image/Metal
  workers behind the same declared-output-only, no-overwrite, checksum-verified
  dependency boundary.

## Implementation continuation note - 2026-05-10 18:00 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-acbe` at `02229d5`, matching
`origin/main` and the previously consolidated grading-adapter head. The local
`main` ref was stale, but `origin/main` and the assigned branch were aligned at
session start.

Branch reconciliation findings:

- Fetched `origin/main` and compared all local and remote refs against it.
- The only useful branch-only work after implementation was the assigned branch:
  `d8b27ad fix(production): validate grade analysis handoff`,
  `334df2b test(production): align grade analysis fixtures`, and
  `87052af test(production): cover malformed grade scheduler reports`.
- Historical remote automation branches were all behind `origin/main` and had no
  commits ahead to merge. The stale local `cursor/setup-dev-env-3ad0` branch was
  also fully behind current main.
- Final reconciliation fast-forwarded local `main` from `origin/main` to the
  assigned branch, reran full verification on `main`, pushed `origin/main`, and
  confirmed `origin/main`, local `main`,
  `cursor/branch-reconciliation-and-merge-acbe`, and
  `origin/cursor/branch-reconciliation-and-merge-acbe` all carry the completed
  grade safety checks.

This run closed two high-priority grading follow-ups from the prior note:

- Added scheduler/report coverage for `grade-production-local` success. The
  persisted scheduler report now has tests proving graded output materialization,
  completed-job counts, materialized-output counts, and downstream story/package
  jobs remaining pending for later compatible adapters.
- Added scheduler/report coverage for a drifted analysis dependency. The grade
  job becomes retryable/review-required, no graded output is materialized, and
  the failure message survives in the persisted report product surface.
- Hardened `grade-production-local` against checksum-consistent but
  schema-invalid analysis payloads. The adapter now requires analysis
  `schema_version` 1, `shootflow-analysis-production-local`, and
  `adapter_metadata` fields matching the trusted dependency job before a grade
  stand-in can be written.
- Added both direct adapter coverage and end-to-end scheduler/report coverage
  for malformed analysis payloads so schema drift routes to retryable review
  instead of silently producing a graded artifact.

Verification performed during this run:

- Initial red check:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler.DryRunProductionSchedulerTests.test_grade_adapter_scheduler_materializes_grade_and_reports_output tests.test_production_scheduler.DryRunProductionSchedulerTests.test_grade_adapter_scheduler_reports_analysis_checksum_drift_as_retryable tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_malformed_analysis_dependency_retryable`
  produced two passing scheduler tests and one failing malformed-analysis test
  because the grade adapter still accepted `schema_version` 2 analysis payloads.
- Focused green after implementation: the same command -> 3 tests OK.
- Related production suites after fixture alignment:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 89 tests OK.
- Final implementation verification before documentation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 90 related production tests OK and 424 full tests OK; compileall and
  diff-check exited 0; the working tree was clean.

Good next test-first targets:

- Register a deterministic `story-production-local` adapter now that grade
  artifacts are more tightly bound to validated analysis/look handoffs.
- Add direct negative coverage for malformed look payload variants consumed by
  `grade-production-local` beyond the current happy-path look validation.
- Replace the grade stand-in with an ffmpeg/Core Image/Metal renderer behind the
  same declared-output-only, no-overwrite, checksum-verified dependency
  boundary.

## Implementation continuation note - 2026-05-10 17:30 UTC

This run started on assigned branch
`cursor/repository-branch-consolidation-bce1` at `840f218`, matching
`origin/main` and the previously consolidated look scheduler coverage head. The
assigned remote branch did not exist at session start.

Branch reconciliation findings:

- Fetched `origin/main` and compared local/remote refs against it.
- No local or remote refs had commits ahead of `origin/main`; the many historical
  remote automation branches are already contained in main.
- Fast-forwarded the stale local `main` ref to `origin/main` without leaving the
  assigned branch.
- Deleted the merged local `cursor/setup-dev-env-3ad0` branch. Remote historical
  branches were left untouched; this automation's safe writable target remains
  the assigned branch plus the explicit main reconciliation target.
- Final reconciliation pushed the completed branch and fast-forwarded
  `origin/main`; `HEAD`, local `main`, `origin/main`, and
  `origin/cursor/repository-branch-consolidation-bce1` all pointed at `cedcd2f`
  before this final documentation update.

This run closed the next adapter-sequence target:

- Code/docs implementation commit: `a107ead feat(production): add guarded grading
  adapter`.
- Added `grade-production-local` to the production adapter registry with
  capability scope `graded_photo`/`graded_video`.
- Added `run_grade_production_action(...)` and batch dispatch through the shared
  production adapter contract.
- The grading adapter verifies one trusted source original plus the succeeded
  checksum-bound analysis and look dependencies before writing a deterministic
  stand-in graded artifact to the declared `graded/<job_id>/<source-name>` path.
- It preserves the existing no-delete/no-cleanup/no-overwrite boundary: missing
  sources, missing or drifted dependencies, symlinked paths, and existing
  different outputs become retryable review states after claim rather than file
  cleanup authority.
- Updated AGENTS/product/business/design docs to clarify that this is a contract
  proof before real ffmpeg/Core Image/Metal grading, not final creative color
  science.

Verification performed during this run:

- Red check before implementation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_writes_deterministic_grade_from_trusted_dependencies tests.test_production_adapter.DryRunProductionAdapterTests.test_grade_adapter_marks_missing_source_retryable_without_output`
  failed because `run_grade_production_action` did not exist.
- Focused green after implementation: the same command -> 3 tests OK.
- Related production suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 86 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 420 tests OK; compileall and diff-check exited 0; only intended files were
  modified before the grading-adapter commit.

Good next test-first targets:

- Add scheduler-level coverage for `grade-production-local` success and
  retryable dependency drift so persisted production scheduler reports surface
  graded output materialization and review-required failures end to end.
- Add direct negative coverage for malformed look/analysis payloads consumed by
  the grade adapter before it becomes a dependency of storyline selection.
- Register a deterministic `story-production-local` adapter only after the grade
  artifact payload shape is stable enough for `rank_instagram_storylines`.
- Replace the grade stand-in with an ffmpeg/Core Image/Metal renderer behind the
  same declared-output-only, no-overwrite boundary.

## Implementation continuation note - 2026-05-10 17:00 UTC

This run started on assigned branch
`cursor/repository-branch-consolidation-b07f` at `b073676`, matching
`origin/main` and the previous consolidated look scene-summary validation head.

Branch reconciliation findings:

- Fetched `origin/main` and compared all local/remote refs against it.
- The current assigned branch has three useful branch-only commits:
  `1a71246 test(production): cover look scheduler scene failures`, which adds
  scheduler/report coverage for retryable look failures, and
  `0a62889 docs: record look scheduler coverage`, which records this
  continuation state, and `0564242 docs: clarify look scheduler branch state`,
  which corrected this branch summary after the documentation commit.
- The only other branch with work ahead of `origin/main` is still
  `origin/cursor/branch-consolidation-d362` at `48a7be4`. It remains one commit
  ahead and three commits behind current main. Its diff would remove the current
  look adapter implementation and tests, so it is stale and was intentionally
  not merged.

This run closed the highest-priority test-first target from the previous note:

- Added scheduler-level coverage for `look-production-local` when the trusted
  scene-grouping dependency checksum drifts before look development.
- Added scheduler-level coverage for a checksum-consistent but schema-invalid
  `analysis/scene_groups.json` payload.
- Both tests exercise the full scheduler/report path:
  `run_dry_run_production_scheduler(...)`, persisted `production_status.json`,
  `write_dry_run_production_scheduler_report(...)`, and
  `load_dry_run_production_scheduler_report(...)`.
- The assertions pin the operational contract: `develop_shoot_look` becomes a
  retryable review state, the persisted report marks it as review-required,
  no `color/shoot_look.json` output is materialized, product metrics count the
  retryable/failure state correctly, and the underlying error message survives
  into scheduler report `failure_messages`.
- No production code change was required; the existing scheduler/adapter path
  already satisfied the new end-to-end contract.

Verification performed during this run:

- Focused new coverage:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler.DryRunProductionSchedulerTests.test_look_adapter_scheduler_reports_scene_checksum_drift_as_retryable tests.test_production_scheduler.DryRunProductionSchedulerTests.test_look_adapter_scheduler_reports_malformed_scene_summary_as_retryable`
  -> 2 tests OK.
- Scheduler suite:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler`
  -> 25 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 418 tests OK; compileall and diff-check exited 0; working tree was clean
  after the test commit.

Good next test-first targets:

- Register the first guarded grading adapter for `graded_video`/`graded_photo`
  only after the strengthened look artifact remains stable enough for downstream
  storyline assembly.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.
- Add native-shell/readout contract tests around future SwiftUI/menu-bar
  controls so observe-only `workflow_authority` remains the gate before any
  copy/retry/materialization controls are exposed.

## Implementation continuation note - 2026-05-10 16:30 UTC

This run started on assigned branch
`cursor/repository-branch-consolidation-c627` at `8bec8d5`, matching
`origin/main` and the previous consolidated look-adapter head. The assigned
remote branch did not exist at session start.

Branch reconciliation findings:

- Fetched `origin/main`; fetching the assigned remote branch failed because the
  remote ref did not exist yet.
- A follow-up `git fetch --prune origin main` showed the current branch and
  `origin/main` were equal before implementation.
- Compared all local and remote refs against `origin/main`. The only ref with
  branch-only commits was `origin/cursor/branch-consolidation-d362`, one
  docs-only commit (`48a7be4`) that adds a 16:00 branch-cleanup note from before
  the look-adapter implementation. It remains ahead by one and behind by two; it
  was intentionally not merged because its continuation note is stale and
  superseded by the 16:00 implementation note plus this note.
- Deleted the stale local-only `cursor/setup-dev-env-3ad0` branch after
  confirming it is contained in `origin/main`.
- Fast-forwarded local `main` to `origin/main` without leaving the assigned
  branch.

This run hardened the `look-production-local` trust boundary:

- Added strict scene-summary schema validation inside the look adapter after the
  scene-grouping output is checksum-verified and before `color/shoot_look.json`
  is written.
- The look adapter now rejects boolean `schema_version`, boolean `scene_count`,
  malformed per-scene counts, non-list or wrong-length `asset_paths`, non-string
  asset paths, malformed `primary_tags`, non-finite/NaN scores, out-of-range
  scores, and `analysis_count` values that do not match the scene asset counts.
- These validation failures become retryable review states after the look job is
  claimed, preserving the no-delete/no-cleanup boundary and avoiding silent look
  profiles from malformed upstream summaries.
- Added direct look-adapter coverage for malformed scene summary payloads,
  wrong output kind, malformed output path, scene checksum drift, symlinked look
  output, existing different look output, and the custom scene dependency ID
  path.
- Updated design decisions to record that `look-production-local` validates
  scene summary shape and aggregate counts, not just dependency checksums.

Verification performed during this run:

- Red regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_malformed_scene_summary_payload`
  failed because a checksum-valid scene summary with malformed `asset_paths`
  still produced a succeeded look output.
- Focused green after parser hardening: the same test -> OK.
- Review-found red: expanded malformed scene-summary subtests failed on the
  boolean/NaN validation gaps before `schema_version`, `scene_count`, and score
  validation were tightened.
- Focused look coverage:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_writes_deterministic_look_from_trusted_scene_groups tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_malformed_scene_dependency_becomes_retryable_after_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_malformed_scene_summary_payload tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_wrong_output_kind_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_malformed_output_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_scene_checksum_drift tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_rejects_symlinked_output_without_modifying_target tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_preserves_existing_different_output_for_review tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_accepts_custom_scene_dependency_id_from_trusted_plan`
  -> 9 tests OK.
- Related production suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 82 tests OK.
- Full verification before this note:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 416 tests OK; compileall and diff-check exited 0 with only the intended
  production-adapter, test, and docs files modified.

Good next test-first targets:

- Add scheduler-level checksum-drift/malformed-scene-summary coverage for
  `look-production-local` so persisted scheduler reports surface the same
  retryable review state through the end-to-end loop.
- Register the first guarded grading adapter for `graded_video`/`graded_photo`
  only after the strengthened look artifact remains stable enough for downstream
  storyline assembly.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 16:00 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-2473` at `e298730`, matching
`origin/main` and the previous consolidated scene-coverage head. The assigned
remote branch did not exist at session start.

Branch reconciliation findings:

- Ran `git fetch --prune origin`; historical remote-tracking refs from prior
  automation runs were pruned.
- After pruning, the only live non-main remote refs were this assigned branch
  and `origin/cursor/branch-consolidation-d362`.
- `origin/cursor/branch-consolidation-d362` has one branch-only commit,
  `48a7be4 docs: record branch consolidation cleanup`, changing only
  `docs/CONTINUATION_NOTES.md`. Its content records the repository state before
  this look-adapter run and is now superseded by this implementation note and
  final reconciliation, so it was intentionally not merged.
- The useful completed work from this run is consolidated on the assigned branch
  and intended to fast-forward `origin/main` after the final verification and
  documentation commit.

This run advanced the next stage-specific production adapter proof:

- Registered `look-production-local` in `shootflow.production_adapter` with
  output-kind scope `("look_development",)`.
- Added `LookProductionAdapterResult`, `run_look_production_action(...)`, and
  `run_look_production_batch(...)` behind the shared `ProductionAdapter*`
  result/batch/error boundary.
- The look adapter validates the serial `develop_shoot_look` action shape and
  declared `color/shoot_look.json` output before claim.
- It verifies the succeeded `group_scene_sets` dependency output against
  `production_status.json` checksums, rejects missing/symlinked/drifted scene
  summaries as retryable review states, and writes deterministic
  `color/shoot_look.json` from the verified scene grouping payload.
- Review found an initial malformed-dependency reliability gap: a scene-grouping
  job with malformed outputs could raise a non-adapter exception after the look
  job was claimed. The adapter now requires exactly one scene-grouping
  dependency with declared `analysis/scene_groups.json`, accepts custom
  scene-grouping job IDs from the trusted plan, reads and checksums the scene
  summary once, and parses those same verified bytes.
- Scheduler capability routing now accepts `look-production-local` only for
  dependency-ready `look_development` jobs, then leaves grade/story/package jobs
  pending or blocked for compatible future adapters.
- This is a contract probe, not final color science: it proves the
  scene-to-shoot-look handoff before real reference-look learning, LUT/Metal
  color processing, or per-asset grading materialization is trusted.

Verification performed during this run:

- Red focused look coverage:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_writes_deterministic_look_from_trusted_scene_groups tests.test_production_scheduler.DryRunProductionSchedulerTests.test_look_adapter_scheduler_leaves_grading_jobs_pending`
  failed because `run_look_production_action` was missing and the scheduler
  rejected unsupported adapter `look-production-local`.
- Focused green for the same command -> 3 tests OK.
- Review-fix red:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_malformed_scene_dependency_becomes_retryable_after_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_look_adapter_accepts_custom_scene_dependency_id_from_trusted_plan`
  failed because malformed scene outputs raised `IndexError` after claim and a
  custom trusted scene dependency ID was not accepted.
- Review-fix green including happy-path adapter/scheduler coverage -> 4 tests OK.
- Related production suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 76 tests OK.
- Full committed-tree verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 410 tests OK; compileall and diff-check exited 0; working tree was clean
  against `origin/cursor/branch-reconciliation-and-merge-2473`.

Good next test-first targets:

- Add remaining direct negative coverage for `look-production-local`: wrong
  output kind, malformed `color/shoot_look.json` output shape, symlinked look
  output, existing different look output, malformed scene summary payload, and
  scene checksum drift.
- Register the first guarded grading adapter for `graded_video`/`graded_photo`
  only after the look artifact has enough schema stability for downstream
  storyline assembly.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 15:30 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-17ff` at `1a3141d`, matching
`origin/main` and the previous consolidated scene-adapter head.

Branch reconciliation findings:

- Ran `git fetch --prune origin`; the old automation remote refs were pruned.
- The only remaining non-main remote work ref after pruning was
  `origin/cursor/branch-consolidation-strategy-b3b2`, pointing at `82feb27`.
  It is contained in `origin/main` and is four commits behind the current
  consolidated head, so it has no branch-only work to merge.
- `origin/cursor/branch-reconciliation-and-merge-bb46` also points at
  `1a3141d`, equal to `origin/main`; it has no branch-only work.
- Local `main` was fast-forwarded to `origin/main` without leaving the assigned
  branch, and the stale local-only `cursor/setup-dev-env-3ad0` branch was
  deleted after confirming it was fully contained in main.
- After verification and commit, pushed `94f21fe` to both the assigned branch
  `origin/cursor/branch-reconciliation-and-merge-17ff` and `origin/main`, so the
  new scene-adapter coverage is not stranded outside main.

This run converted the previous scene-adapter residual risk list into direct
coverage:

- Added explicit pre-claim tests for `scene-production-local` wrong
  `output_kind` and malformed `analysis/scene_groups.json` output shape.
- Added post-claim safety tests proving symlinked scene-group output targets are
  not followed, existing different manual scene-group outputs are preserved for
  review, and unplanned per-asset analysis JSON files prevent scene grouping.
- Added a reusable scene-analysis fixture helper so future scene adapter tests
  can create trusted analysis files and matching status checksums without
  repeating setup.

Verification performed during this run:

- Focused scene negative coverage:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_wrong_output_kind_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_malformed_output_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_symlinked_output_without_modifying_target tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_preserves_existing_different_output_for_review tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_unplanned_analysis_file_without_output`
  -> 5 tests OK before this note was written.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 406 tests OK; compileall and diff-check exited 0 with only the expected
  documentation/test files modified.

Good next test-first targets:

- Add scheduler-level checksum-drift coverage for scene grouping so the
  end-to-end scheduler report path records the retryable review state, not only
  the direct adapter call.
- Register the next stage-specific adapter deliberately, likely
  `look-production-local` for `look_development` or a guarded grade-decision
  proof, and prove it only schedules output kinds it can materialize.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 15:00 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-bb46` at `5d86af0`, matching
`origin/main` before fetch. The assigned remote branch did not exist yet at
session start.

Branch reconciliation at session start:

- Fetched `origin/main` plus the prior saved work branch
  `origin/cursor/branch-reconciliation-and-merge-24db`.
- The current checkout initially did not contain the 14:30 UTC hardening commit
  `82feb27`; that prior branch was one commit ahead of `origin/main`.
- Fast-forwarded the assigned branch to `82feb27` before starting new work, so
  the analysis-adapter safety coverage and adapter-specific failure labels are
  not stranded outside this branch.
- Pushed the assigned branch after that fast-forward before the next
  implementation/testing loop.

This run completed the next test-first adapter capability target:

- Registered `scene-production-local` in `shootflow.production_adapter` with
  output-kind scope `("scene_grouping",)`.
- Added `run_scene_production_action(...)` and
  `run_scene_production_batch(...)` behind the shared `ProductionAdapter*`
  result/batch/error boundary.
- The scene adapter validates that it is offered only the serial
  `scene_grouping` job with declared output `analysis/scene_groups.json` before
  claim.
- It consumes trusted per-asset analysis artifacts through
  `load_asset_analyses(...)`, then writes a deterministic
  `analysis/scene_groups.json` summary with scene labels, grouped graded asset
  paths, asset/media counts, primary tags, and average score signals.
- Follow-up review found the initial scene adapter loaded analysis JSON without
  verifying it against the succeeded analysis job checksums in
  `production_status.json`. This run added a red checksum-drift regression and
  now verifies every scene dependency output exists, is not symlinked, and
  matches its recorded checksum before scene grouping materializes output.
- Missing or invalid analysis files become retryable review states after a
  guarded claim, preserving the trusted status loop without deleting source,
  analysis, graded, render, or deliverable files.
- Scheduler capability routing now accepts `scene-production-local` for
  dependency-ready scene grouping after analysis success, then leaves
  look/color/grade/story/package jobs pending or blocked for compatible future
  adapters.
- CLI help plus AGENTS, README, product strategy, business plan, and design
  decisions document this as a deterministic serial-stage contract probe, not
  final creative scene clustering.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_writes_deterministic_grouping_from_trusted_analyses tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_missing_analysis_becomes_retryable_after_claim tests.test_production_scheduler.DryRunProductionSchedulerTests.test_scene_adapter_scheduler_leaves_downstream_jobs_pending`
  failed because `run_scene_production_action` was missing and the scheduler
  rejected unsupported adapter `scene-production-local`.
- Focused green:
  same command -> 4 tests OK.
- Review fix red:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_analysis_checksum_drift`
  failed because the scene adapter marked checksum-drifted analysis files as
  succeeded.
- Review fix green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_writes_deterministic_grouping_from_trusted_analyses tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_missing_analysis_becomes_retryable_after_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_scene_adapter_rejects_analysis_checksum_drift tests.test_production_scheduler.DryRunProductionSchedulerTests.test_scene_adapter_scheduler_leaves_downstream_jobs_pending`
  -> 4 tests OK.
- Related suites from committed tree:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 66 tests OK.
- Full committed-tree verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 400 tests OK; compileall and diff-check exited 0; working tree was clean
  against the pushed assigned branch before this continuation-note update.

Final branch reconciliation:

- Ran `git fetch --prune origin` after implementation. It pruned the historical
  automation branches that were already gone from the remote and surfaced one
  remaining non-main remote work ref:
  `origin/cursor/branch-consolidation-strategy-b3b2`.
- Compared remaining remote branches against the verified head. The remaining
  `b3b2` branch pointed at `82feb27`, so it was contained in this run's branch
  and had no branch-only work ahead of the consolidated head.
- Fast-forwarded local `main` to the verified assigned-branch head and pushed
  `origin/main` to `96c2beb`, so the 14:30 hardening commit plus this scene
  adapter work are not stranded outside main.
- Restored the assigned branch upstream to
  `origin/cursor/branch-reconciliation-and-merge-bb46` after the `HEAD:main`
  push, leaving the current checkout on the assigned branch.
- Final comparison showed `origin/main`, current `HEAD`, and
  `origin/cursor/branch-reconciliation-and-merge-bb46` equal; the remaining
  `origin/cursor/branch-consolidation-strategy-b3b2` branch was two commits
  behind main and contained no unique work.

Good next test-first targets:

- Register the next stage-specific adapter deliberately, likely
  `look-production-local` for `look_development` or a guarded grade-decision
  proof, and prove it only schedules output kinds it can materialize.
- Add direct negative coverage for `scene-production-local`: wrong output kind,
  malformed output, symlinked `analysis/scene_groups.json`, existing different
  scene-group output, and unplanned per-asset analysis file propagation from
  `load_asset_analyses(...)`.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 14:30 UTC

This run started on assigned branch
`cursor/branch-reconciliation-and-merge-24db` at `5d86af0`, matching
`origin/main` and `origin/cursor/repository-branch-consolidation-3d2e`. The
assigned remote branch did not exist yet at session start.

Branch reconciliation findings:

- `git fetch --prune origin main` completed successfully.
- No remote work branch was ahead of `origin/main`; all remote feature refs were
  contained in main.
- Local `main` and local `cursor/setup-dev-env-3ad0` were stale local refs only;
  neither contained branch-only work ahead of `origin/main`.
- Final local cleanup fast-forwarded local `main` to `origin/main` without
  leaving the assigned branch and deleted stale local
  `cursor/setup-dev-env-3ad0`.
- Because the cloud branch contract for this session requires pushing only the
  assigned branch, this run preserves the new hardening work on
  `cursor/branch-reconciliation-and-merge-24db` for the platform's PR/merge flow
  rather than pushing directly to `main`.

This run completed the documented analysis-adapter hardening pass:

- Added direct negative coverage for `analysis-production-local` wrong output
  kind, malformed `analysis/00000.json` output shape, malformed input path,
  symlinked input, symlinked output, and existing different analysis output.
- The wrong-kind and malformed-output tests prove those invalid actions are
  rejected before the adapter claims production status, leaving the trusted
  manifest unchanged.
- The symlink and existing-different-output tests prove the analysis adapter
  preserves outside targets/manual outputs and returns retryable review states
  without materializing declared analysis JSON.
- Shared adapter path/output helpers now accept adapter-specific labels, so
  retryable errors for analysis/proxy/metadata failures name the boundary that
  actually failed instead of leaking generic dry-run or metadata wording,
  including unsafe input-path validation.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_rejects_symlinked_input_without_output tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_preserves_existing_different_output_for_review`
  failed because analysis failures still reported `metadata production input` and
  `dry-run production output` labels.
- Focused green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_rejects_wrong_output_kind_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_rejects_malformed_output_before_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_malformed_input_becomes_retryable_after_claim tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_rejects_symlinked_input_without_output tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_rejects_symlinked_output_without_modifying_target tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_preserves_existing_different_output_for_review`
  -> 6 tests OK.
- Related suite:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter`
  -> 30 tests OK.
- Final verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 397 tests OK; compileall and diff-check exited 0; working tree had only
  the intended docs, adapter, and adapter-test modifications.

Good next test-first targets:

- Register the next stage-specific adapter deliberately, likely scene grouping
  or look/color decision proof, and prove it only schedules output kinds it can
  materialize.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.
- Add a small packaging consistency pass if desired: align `shootflow.__all__`
  with the public-adjacent modules now documented in README and CLI workflows.

## Implementation continuation note - 2026-05-10 14:00 UTC

This run started on assigned branch
`cursor/repository-branch-consolidation-3d2e` at `c4384fc`, matching
`origin/main` and `origin/cursor/branch-reconciliation-and-merge-c7c5`.
Branch reconciliation at session start pruned many deleted historical automation
branches. After pruning, the only remaining non-main remote work refs were:

- `origin/cursor/branch-reconciliation-and-merge-448b`, contained in main and
  two commits behind.
- `origin/cursor/branch-reconciliation-and-merge-c7c5`, equal to `origin/main`.

Useful work was therefore not stranded on another remote branch before this
session's implementation began. Local `main` was stale and local
`cursor/setup-dev-env-3ad0` remained a redundant branch to clean up during final
reconciliation.

This run completed the next test-first adapter capability target:

- Registered `analysis-production-local` in `shootflow.production_adapter` with
  output-kind scope `("vlm_asset_analysis",)`.
- Added `run_analysis_production_action(...)` and
  `run_analysis_production_batch(...)` behind the existing
  `ProductionAdapter*` result/batch boundary.
- The adapter validates `vlm_asset_analysis` actions and
  `analysis/00000.json`-style declared outputs before claim, then uses the same
  guarded production-status claim/final compare-write path as dry-run, metadata,
  and proxy adapters.
- It writes deterministic, schema-compatible per-asset analysis JSON from
  trusted workspace input bytes. This is a local contract probe, not real VLM
  quality: scores are deterministic local values so scheduler routing,
  checksums, and `load_asset_analyses(...)` compatibility can be proven before a
  model-backed worker is trusted.
- Scheduler capability routing now accepts `analysis-production-local` for ready
  analysis jobs after proxy success, then leaves scene/color/story/package work
  pending or blocked for compatible future adapters.
- CLI help plus README, AGENTS, product strategy, business plan, and design
  decisions now document the adapter as a deterministic analysis/status-boundary
  proof rather than a finished creative model.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_adapter.DryRunProductionAdapterTests.test_analysis_adapter_writes_schema_compatible_asset_analysis tests.test_production_scheduler.DryRunProductionSchedulerTests.test_analysis_adapter_scheduler_leaves_downstream_jobs_pending`
  failed because `run_analysis_production_action` was not exported and the
  scheduler rejected unsupported adapter `analysis-production-local`.
- Focused green:
  same command -> 3 tests OK.
- Related suites:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler`
  -> 45 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 391 tests OK; compileall and diff-check exited 0.
- Independent code review reported no findings. Residual test gap: the analysis
  happy path and scheduler routing are covered, while direct negative tests for
  malformed analysis actions/outputs and existing different analysis outputs can
  be added in a future hardening pass; shared writer and symlink behavior are
  already covered through metadata/proxy adapter tests.

Good next test-first targets:

- Add direct negative coverage for `analysis-production-local`: non-analysis
  output kind, malformed `analysis/*.json` output, symlinked input/output, and
  existing different analysis output.
- Register the next stage-specific adapter deliberately, likely scene grouping
  or look/color decision proof, and prove it only schedules output kinds it can
  materialize.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 13:30 UTC

This run continued from `origin/main`/`origin/cursor/branch-reconciliation-and-merge-448b`
on the assigned local branch `cursor/branch-reconciliation-and-merge-c7c5`.
The remote branch did not exist at session start, but the local branch was
already at the reconciled main head.

- Completed the next documented adapter cleanup: shared production-adapter
  handoff types are now adapter-neutral:
  - `ProductionAdapterError`
  - `ProductionAdapterResult`
  - `ProductionAdapterFailure`
  - `ProductionAdapterBatchResult`
- Updated `shootflow.production_scheduler` to import and annotate the neutral
  batch/error types while leaving the scheduler-specific
  `DryRunProductionScheduler*` names intact. The scheduler remains a dry-run
  local orchestration loop; only the adapter handoff stopped implying dry-run
  execution.
- Updated adapter tests to import the neutral names and assert that metadata
  batch execution returns `ProductionAdapterBatchResult`. This protects the
  registry/dispatch surface future VLM, color, storyline, and packaging adapters
  will share.
- Updated README and design decisions to record why this matters: metadata and
  proxy adapters are real local proofs now, so the shared adapter result/error
  contract should not carry a placeholder-only name.

Branch reconciliation status from this run:

- `git fetch --prune origin main` succeeded.
- Remote `origin/main` and `origin/cursor/branch-reconciliation-and-merge-448b`
  were already at `fc7e4d1`; the local assigned branch started at the same
  commit.
- The requested remote branch
  `origin/cursor/branch-reconciliation-and-merge-c7c5` did not exist before this
  run. It was created by pushing the assigned branch after the adapter cleanup
  commit.
- A full remote-branch comparison showed every existing remote work branch was
  contained in `origin/main` (`branch_only=0` for all non-main remotes). No
  useful completed work was stranded outside main. Remaining old remote branches
  are redundant historical refs, but this session has no dedicated remote branch
  deletion tool/permission.
- After verification and review, local `main` was reset to `origin/main`,
  fast-forwarded to the assigned branch, and pushed so `origin/main` also points
  at this completed work. A final remote comparison then showed
  `origin/main` and `origin/cursor/branch-reconciliation-and-merge-c7c5` both at
  `3512e83` with no remote branch ahead of main.
- Local `cursor/setup-dev-env-3ad0` was contained in `origin/main` and was
  deleted locally during cleanup.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_persists_claim_and_success_for_declared_outputs`
  failed because `ProductionAdapterBatchResult` was not exported yet.
- Focused green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter`
  -> 23 tests OK.
- Scheduler focused green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler`
  -> 20 tests OK.
- Full verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 389 tests OK; compileall and diff-check exited 0.
- Independent code review reported no findings. Residual risk: external,
  untracked consumers still importing obsolete `DryRunProduction*` adapter
  handoff names must update to `ProductionAdapter*`.

Good next test-first targets:

- Register the next local adapter capability deliberately, likely a VLM/analysis
  metadata worker or real proxy-rendering worker, and prove it only schedules the
  output kinds it can materialize.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.
- Keep `ProductionAdapter*` and adapter capability metadata synchronized as
  additional worker backends are registered.

## Implementation continuation note - 2026-05-10 13:00 UTC

This run reconciled the assigned branch
`cursor/branch-reconciliation-and-merge-448b` with
`origin/cursor/branch-consolidation-strategy-40f7`, which contained the stronger
adapter-registry version of the same scheduler-routing work.

- Initial assigned-branch increment added a proxy scheduler regression plus a
  simple adapter capability predicate, proving the scheduler should not offer
  `analyze_asset_00000` to `proxy-production-local`.
- During reconciliation, adopted the stronger `40f7` design: local adapter
  capability metadata now lives in `shootflow.production_adapter` via
  `supported_production_adapter_output_kinds(...)`; `shootflow.production_worker`
  filters both action planning and stale lease expiration by eligible output
  kinds; and `shootflow.production_scheduler` reads that registry rather than
  hard-coding proxy behavior.
- Kept this run's AGENTS/product-strategy documentation updates and the stronger
  README/business/design/test coverage from `40f7`.
- Resulting behavior: proxy-only scheduler runs materialize proxy jobs, leave
  dependency-ready analysis/color/story/package work pending or running for
  compatible future adapters, and do not record expected stage mismatch as proxy
  adapter failure or stale-lease retry state.

Branch reconciliation status from this run:

- `origin/cursor/branch-consolidation-strategy-40f7` has been merged into the
  assigned branch and `origin/main`, then deleted as redundant after confirming
  containment.
- `origin/main` was fast-forwarded to the reconciled assigned-branch head so the
  adapter-registry work and this session's scheduler regression are not stranded
  outside main.
- Deleted stale local `cursor/setup-dev-env-3ad0` after fetch marked its upstream
  gone, reset local `main` to `origin/main` without checking it out, and restored
  the assigned branch upstream to
  `origin/cursor/branch-reconciliation-and-merge-448b`.
- Final branch state after prune: local `main`, local assigned branch,
  `origin/main`, and `origin/cursor/branch-reconciliation-and-merge-448b` all
  point at `c0b5ffa`.

Verification performed after the reconciliation merge:

- Focused production/CLI regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_worker tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli tests.test_cli`
  -> 132 tests OK.
- Full repository verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 389 tests OK; compileall and diff-check exited 0.

## Implementation continuation note - 2026-05-10 12:30 UTC

This run first reconciled the prior 12:00 UTC scheduler-routing branch into the
assigned branch, then removed the scheduler-owned adapter capability conditional:

- Fast-forwarded assigned branch `cursor/repository-branch-consolidation-1804`
  to `origin/cursor/repository-branch-consolidation-1bd5`, preserving the
  stage-specific `proxy-production-local` scheduler routing and stale-lease
  scoping work.
- Added `supported_production_adapter_output_kinds(...)` in
  `shootflow.production_adapter` and backed it with the local adapter registry.
  Today dry-run and metadata adapters return `None` for all output kinds, while
  `proxy-production-local` returns `("proxy_media",)`.
- Updated `shootflow.production_scheduler` to read output-kind eligibility from
  the adapter layer instead of hard-coding a proxy adapter special case. Future
  VLM, color, storyline, and packaging workers can now declare their supported
  `output_kind` values with their adapter registration before the scheduler
  offers them jobs or expires their stale leases.
- Updated README, business plan, and design decisions to describe the adapter
  registry as the source of stage capability metadata.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters`
  failed because `supported_production_adapter_output_kinds` was missing.
- Focused green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter.DryRunProductionAdapterTests.test_declares_supported_output_kinds_for_stage_specific_adapters tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_leaves_non_proxy_jobs_pending_for_later_adapters tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_does_not_expire_non_proxy_running_leases`
  -> 3 tests OK.
- Full repository verification after commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 389 tests OK; compileall/diff-check exited 0; working tree was clean on
  `cursor/repository-branch-consolidation-1804`.
- Independent code review found no issues. Residual maintenance risk: adapter
  capability metadata and batch dispatch must stay in sync as future adapters are
  registered.

Final branch reconciliation:

- Ran `git fetch --prune origin`. Remaining remotes:
  `origin/main`, `origin/cursor/branch-consolidation-bfe5`,
  `origin/cursor/repository-branch-consolidation-1bd5`, and assigned
  `origin/cursor/repository-branch-consolidation-1804`.
- `origin/cursor/branch-consolidation-bfe5` is exactly contained in
  `origin/main` (`origin/main...origin/cursor/branch-consolidation-bfe5` =
  `0 0`), so it has no stranded unique work.
- `origin/cursor/repository-branch-consolidation-1bd5` is contained in the
  assigned branch (`1bd5...1804` = `0 1`), so the prior scheduler-routing work is
  consolidated here.
- Assigned branch `origin/cursor/repository-branch-consolidation-1804` is four
  commits ahead of `origin/main`: the two stage-routing commits, the 12:00
  branch note, and this adapter-registry refactor.
- Deleted stale local `cursor/setup-dev-env-3ad0` after fetch marked its upstream
  gone, and reset the local `main` ref to `origin/main` without checking it out.
- Did not push `origin/main` or delete remote branches because the active Cloud
  branch instructions require pushes only to the assigned branch. Useful work is
  pushed on `origin/cursor/repository-branch-consolidation-1804` for normal PR
  automation; `branch-consolidation-bfe5` is redundant but remote cleanup is
  intentionally left to automation with branch-write authority.

Good next test-first targets:

- Register the next local adapter capability deliberately, likely a metadata/VLM
  or real proxy-rendering worker, and prove it only schedules the output kinds it
  can materialize.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

## Implementation continuation note - 2026-05-10 12:00 UTC

This run continued the production-adapter hardening thread from the 11:30 UTC
proxy adapter work.

- Added an output-kind eligibility filter to `plan_production_worker_actions(...)`
  so scheduler callers can ask for only the stages a specific local adapter can
  actually execute.
- Wired the production scheduler to treat `proxy-production-local` as a
  stage-specific proxy-wave worker. It now schedules only `proxy_media` jobs for
  that adapter and leaves ready analysis/color/story/package jobs pending for
  future adapters rather than attempting them through the proxy copy path.
- Updated the proxy scheduler regression to assert the desired product behavior:
  after proxy materialization, analysis remains pending with zero attempts,
  retryable IDs stay empty, blocked IDs stay empty, and the scheduler stops as
  `waiting` for another adapter.
- Updated README/business/design documentation to make the stage-specific adapter
  contract explicit.
- Review follow-up fixed stale-lease scoping: proxy-only scheduler runs now pass
  the same output-kind eligibility filter into stale production lease planning,
  so stale running analysis/color/story/package jobs are not expired into proxy
  retryable state.

Verification performed during this run:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_leaves_non_proxy_jobs_pending_for_later_adapters`
  failed because the scheduler still stopped as `blocked`.
- Focused green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_worker.ProductionWorkerTests.test_filters_worker_actions_by_eligible_output_kind_without_blocking_other_stages tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_leaves_non_proxy_jobs_pending_for_later_adapters`
  -> 2 tests OK.
- Review regression red:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_worker.ProductionWorkerTests.test_rejects_invalid_eligible_output_kind_filters tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_max_iteration_check_ignores_non_proxy_jobs tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_does_not_expire_non_proxy_running_leases`
  failed because `analyze_asset_00000` was still expired by the proxy scheduler.
- Review regression green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_worker.ProductionWorkerTests.test_rejects_invalid_eligible_output_kind_filters tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_max_iteration_check_ignores_non_proxy_jobs tests.test_production_scheduler.DryRunProductionSchedulerTests.test_proxy_adapter_scheduler_does_not_expire_non_proxy_running_leases`
  -> 3 tests OK.
- Focused production/CLI regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_worker tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli tests.test_cli`
  -> 127 tests OK.

Good next test-first targets:

- Move the adapter capability map out of the scheduler into an adapter registry
  once additional local workers land, so VLM, color, storyline, and packaging
  adapters can declare their supported `output_kind` values without growing
  scheduler conditionals.
- Completed later in the 13:30 UTC iteration: rename shared adapter
  result/failure/batch/error types to neutral `ProductionAdapter*` names.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

Final branch reconciliation:

- Ran `git fetch --prune origin`. Historical remote work branches were pruned by
  the remote; the only remaining non-main remotes were
  `origin/cursor/branch-consolidation-bfe5`, which is already contained in
  `origin/main`, and the assigned
  `origin/cursor/repository-branch-consolidation-1bd5`, which is two commits
  ahead of `origin/main` with this run's completed scheduler-routing work.
- Deleted stale local `cursor/setup-dev-env-3ad0` after confirming it was merged
  into `origin/main`, and reset the local `main` ref to `origin/main` without
  checking it out.
- Did not fast-forward or push `origin/main` in this run because the active Cloud
  branch instructions require all pushes to the assigned branch only. The useful
  completed work is therefore consolidated and pushed on
  `origin/cursor/repository-branch-consolidation-1bd5` for normal PR automation.

## Implementation continuation note - 2026-05-10 11:30 UTC

This run first reconciled stranded completed work, then added the next
production-adapter increment:

- Merged `origin/cursor/branch-consolidation-strategy-a88d` into the assigned
  branch `cursor/repository-branch-consolidation-7d3b`, preserving main's
  schema-v2 legacy scheduler authority coverage and bringing in the
  `metadata-production-local` adapter plus pilot readiness blocker work.
- Resolved scheduler-test conflicts by keeping both useful assertions: legacy
  schema v2 reports synthesize observe-only `workflow_authority` while
  preserving product metrics, and current schema v3 reports reject missing
  authority.
- Added `proxy-production-local` as a guarded local production adapter. It
  byte-copies a trusted workspace input into the declared proxy output as a
  conservative stand-in for future ffmpeg/Metal downsampled proxy generation.
  It consumes only trusted `ProductionWorkerAction` records, persists claim and
  result transitions through `production_status.json`, refuses missing inputs,
  symlinks, directory-style outputs, and existing different outputs, and reports
  retryable review state without deleting or cleaning up media.
- Review follow-up fixed a proxy-only scheduler safety issue: non-proxy jobs now
  fail adapter validation before any status claim, so a multi-iteration
  `proxy-production-local` scheduler run cannot mark analysis/color/story jobs
  retryable or consume attempts. Added direct symlink input/output regressions
  for the proxy copy path.
- Updated README, AGENTS, product strategy, business plan, design decisions, and
  CLI help to make the proxy adapter's scope explicit: it proves safe
  media-byte materialization but is not the final quality proxy renderer.

Verification performed after the proxy increment:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter`
  failed because `run_proxy_production_action` was missing.
- Focused proxy green:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter`
  -> 20 tests OK.
- Focused production/CLI regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_status_cli tests.test_production_scheduler tests.test_cli`
  -> 115 tests OK.
- Review follow-up focused regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli tests.test_cli`
  -> 118 tests OK.
- Full repository verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 381 tests OK; compileall and diff-check exited 0.

Good next test-first targets:

- Teach the production scheduler or worker planning layer how to run
  stage-specific adapters without accidentally offering a proxy-only adapter
  later analysis/color/story jobs. Until then, run `proxy-production-local` as a
  proxy-wave adapter, not as an end-to-end production scheduler worker.
- Completed later in the 13:30 UTC iteration: rename shared adapter
  result/failure/batch/error types to neutral `ProductionAdapter*` names.
- Replace `proxy-production-local`'s byte-identical stand-in with an ffmpeg or
  Core Image/Metal downsampled proxy renderer behind the same no-overwrite,
  declared-output-only boundary.

Final branch reconciliation:

- `git fetch --prune origin` removed historical remote-tracking branches. The
  remaining remote work branches were `origin/cursor/branch-consolidation-strategy-a88d`,
  `origin/cursor/repository-branch-consolidation-110c`,
  `origin/cursor/repository-branch-consolidation-7d3b`, and `origin/main`.
- The assigned branch contains both remaining historical branches:
  `branch-consolidation-strategy-a88d` contributed the metadata adapter and
  pilot blocker work, while `repository-branch-consolidation-110c` matches the
  scheduler-authority baseline that had already been pushed to main.
- Deleted stale local `cursor/setup-dev-env-3ad0` after confirming it was merged
  into `origin/main`, and reset the local `main` ref without checking it out.
- Fast-forwarded `origin/main` to the consolidated assigned-branch head so the
  metadata adapter, pilot blocker work, and this session's proxy adapter are not
  stranded outside main.
- Deleted the redundant remote branches
  `cursor/branch-consolidation-strategy-a88d` and
  `cursor/repository-branch-consolidation-110c` after confirming both were
  contained in `origin/main`.
- Final state for the next run: only `origin/main` and the assigned
  `origin/cursor/repository-branch-consolidation-7d3b` remain, and both point at
  the same consolidated head once this note is committed and pushed.

## Branch reconciliation note - 2026-05-10 11:00 UTC

This automation run continued from `origin/main`/`2ae8935` on the assigned
branch `cursor/repository-branch-consolidation-110c` and reconciled the two
remote branches with unique work:

- Merged `origin/cursor/repository-branch-consolidation-f53c` by fast-forward.
  This branch was valuable product work: persisted production/render scheduler
  reports now emit schema v3 with root observe-only `workflow_authority`, legacy
  scheduler report schemas still load as observe-only, and loaders reject
  authorizing report authority.
- Rejected `origin/cursor/branch-consolidation-f0b0` for this run. Its unique
  diff was only a continuation-note section that described a remote branch state
  that is no longer true after this session's fetch; no implementation, tests,
  product strategy, or architecture work was stranded there.
- Followed up on independent review by adding explicit schema v2 legacy-report
  regressions for both scheduler loaders. Schema v1 fallback already had derived
  metric coverage; schema v2 fallback now also proves missing
  `workflow_authority` is synthesized as observe-only while preserving product
  metrics.
- Pushed the reconciled assigned branch to
  `origin/cursor/repository-branch-consolidation-110c`, then pushed the same
  consolidated head to `origin/main` so useful completed work is no longer
  stranded on an automation branch.
- Final remote comparison after the main push showed
  `origin/cursor/repository-branch-consolidation-110c` exactly matches
  `origin/main`; `origin/cursor/repository-branch-consolidation-f53c` is now
  contained in main; historical branches are behind main; and
  `origin/cursor/branch-consolidation-f0b0` remains intentionally unmerged
  because its only unique commit is the stale documentation note described
  above.
- Reset local `main` to `origin/main` without checking it out and deleted stale
  local branch `cursor/setup-dev-env-3ad0`.

Verification performed after reconciliation:

- Focused scheduler/CLI authority suite:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_render_scheduler tests.test_production_scheduler tests.test_production_status_cli tests.test_cli`
  -> 110 tests OK.
- Focused legacy authority follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_render_scheduler tests.test_production_scheduler`
  -> 38 tests OK.
- Full repository verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check && git status --short --branch`
  -> 350 tests OK; compileall and diff-check exited 0; working tree clean
  on `cursor/repository-branch-consolidation-110c` tracking
  `origin/cursor/repository-branch-consolidation-110c`.

## Branch consolidation note - 2026-05-10 11:00 UTC

Final branch cleanup for this session:

- The assigned branch `cursor/branch-consolidation-strategy-a88d` started at
  `origin/main`/`2ae8935` and fast-forwarded to the strongest remaining branch,
  `origin/cursor/repository-branch-consolidation-7e94`.
- `origin/cursor/repository-branch-consolidation-7e94` was a strict superset of
  `origin/cursor/branch-consolidation-c072`, adding the relative/logical
  metadata input handling and expanded production adapter tests on top of the
  earlier scheduler authority, metadata adapter, and pilot blocker work.
- After pushing the assigned branch, the superseded remote branches
  `cursor/branch-consolidation-c072` and
  `cursor/repository-branch-consolidation-7e94` were deleted.
- The stale local `cursor/setup-dev-env-3ad0` branch was deleted after
  confirming it was already contained, and local `main` was moved to
  `origin/main` without checking it out.
- A newly surfaced `origin/cursor/repository-branch-consolidation-110c` branch
  was rejected and deleted because its only unique diff was an obsolete
  continuation-note block describing branch state that had already been
  superseded by this cleanup.
- Final branch count after pruning: local branches are `main` and
  `cursor/branch-consolidation-strategy-a88d`; remote branches are
  `origin/main` and `origin/cursor/branch-consolidation-strategy-a88d`.

## Branch reconciliation note - 2026-05-10 10:00 UTC

Final reconciliation for this session:

- The assigned branch `cursor/repository-branch-consolidation-7e94` started at
  `origin/main` and first fast-forwarded to the useful scheduler-authority branch
  `origin/cursor/repository-branch-consolidation-f53c`.
- This session then added metadata adapter improvements on the assigned branch:
  shared local adapter dispatch, `metadata-production-local` input
  fingerprinting, absolute/relative trusted input handling, malformed-path
  retryable handling, and docs/tests.
- A final branch pass surfaced `origin/cursor/branch-consolidation-c072`, a newer
  consolidation branch with the earlier metadata adapter, scheduler authority,
  and pilot readiness-blocker work. This assigned branch merged it with
  `merge: reconcile branch consolidation work`.
- Conflicts were resolved by preserving the incoming pilot cohort blocker/report
  implementation and metadata safety coverage, while keeping this session's
  shared adapter status/output flow and absolute/relative metadata input fixes.
- `origin/cursor/branch-consolidation-f0b0` was pruned before the final branch
  pass; its only unique content was an obsolete cleanup note and it was not
  merged.
- `origin/main` was not checked out or pushed because the Cloud branch
  requirements for this automation require pushes to the assigned branch only.
- Final live branch comparison after verification: assigned branch
  `origin/cursor/repository-branch-consolidation-7e94` is ahead of
  `origin/main`; `origin/cursor/branch-consolidation-c072` remains visible but is
  fully contained in the assigned branch.

## Implementation continuation note - 2026-05-10 10:00 UTC

This run leaves the metadata adapter materially stronger than the prior
consolidated branch:

- `run_production_adapter_batch(...)` dispatches registered adapters by explicit
  adapter name while retaining bounded parallel execution and blocked-job
  visibility.
- `metadata-production-local` now accepts trusted workspace-relative inputs,
  relative manifest paths that already resolve under the shoot workspace, and
  absolute ingest-manifest paths under the shoot workspace. Its output JSON uses
  workspace-relative display paths.
- Malformed input refs, missing inputs, symlinked inputs/outputs, outside-workspace
  absolute inputs, directory-style outputs, and existing different outputs become
  retryable review states instead of escaping after a claim or modifying user
  files.
- Video-only metadata scheduler runs now complete end-to-end by treating the
  look-development shoot slug as a narrow logical input while preserving
  retryable behavior for missing real file inputs.
- The branch also inherits pilot cohort readiness blockers and controlled blocker
  labels from the consolidated branch.

Final verification:

- Focused post-merge regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_status_cli tests.test_pilot_cohort_brief tests.test_pilot_cohort_report tests.test_production_scheduler tests.test_render_scheduler tests.test_cli`
  -> 164 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 378 tests OK; compileall and diff-check exited 0.

Good next test-first targets:

- Add a real proxy-generation adapter behind the same `ProductionWorkerAction`
  boundary, using `metadata-production-local` as the input-fingerprint and
  declared-output safety pattern.
- Completed later in the 13:30 UTC iteration: rename shared adapter
  result/failure/batch/error types to neutral `ProductionAdapter*` names.
- Bind scheduler reports plus `handoff-controls` into a minimal native-shell CLI
  fixture so UI controls are disabled from the authority payload rather than
  presentation prose.

## Branch reconciliation note - 2026-05-10 09:30 UTC

Final reconciliation for this session:

- Started on assigned branch `cursor/branch-reconciliation-and-merge-96ab`,
  matching `origin/main` at `2ae8935`.
- The first branch pass found `origin/cursor/repository-branch-consolidation-f53c`
  as useful unmerged scheduler-report-authority work, so the assigned branch
  fast-forwarded through `fc635ed docs: update scheduler authority verification`
  and was pushed.
- This session then rebuilt the documented `metadata-production-local` target on
  the assigned branch with test-first commits, before a fresh `git fetch --prune
  origin` surfaced the newer superset
  `origin/cursor/repository-branch-consolidation-8b6e`.
- `origin/cursor/repository-branch-consolidation-8b6e` already contained the
  scheduler authority work, an earlier metadata adapter, and the 09:00 pilot
  cohort-brief blocker presentation work. The assigned branch merged it with
  `b267fe5 Merge remote-tracking branch
  'origin/cursor/repository-branch-consolidation-8b6e' into
  cursor/branch-reconciliation-and-merge-96ab`.
- Merge conflicts were resolved by preserving the cohort blocker/report work and
  the stronger consolidated metadata adapter implementation, while removing this
  session's duplicate CLI metadata scheduler test. The assigned branch keeps this
  session's additional docs describing the metadata adapter and branch-specific
  test-first history.
- Final live remote comparison: the assigned branch is 35 commits ahead of
  `origin/main`; `origin/cursor/repository-branch-consolidation-8b6e` is
  contained in the assigned branch; `origin/cursor/branch-consolidation-strategy-afaf`
  remains 26 commits ahead of main but is a same-tree/older consolidation branch
  already covered by the merged superset.
- `origin/main` was not checked out or pushed because the Cloud branch
  requirements for this automation require final pushes only to
  `cursor/branch-reconciliation-and-merge-96ab`. Useful completed work is now
  consolidated on the assigned branch for normal PR automation.

## Implementation continuation note - 2026-05-10 09:30 UTC

This run advanced the production-worker adapter layer and reconciled the latest
pilot analytics branch:

- Added test-first coverage for `metadata-production-local` as a supported local
  production adapter: unit tests cover deterministic metadata output, symlinked
  inputs, symlinked outputs, and the CLI scheduler path.
- Implemented/merged the local metadata adapter behind the existing trusted
  production-worker action contract. It fingerprints trusted local inputs, writes
  deterministic JSON only to declared outputs, persists claims/results through
  `production_status.json`, and reports retryable review states instead of
  copying, deleting, cleaning up, or inventing paths.
- Merged the 09:00 cohort-brief readiness blocker work so the assigned branch
  also includes structured readiness blocker counts and controlled blocker labels
  in `pilot-cohort-brief`.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  to describe registered local production adapters and the metadata adapter's
  declared-output-only boundary.
- Code review found no blocking issues and flagged one important coverage gap:
  metadata-adapter symlink/input/output conflict regressions. This run added
  `bf1a07b test(production): cover metadata adapter safety conflicts` to cover
  symlinked inputs, symlinked outputs, and existing different metadata outputs
  remaining retryable without modifying user files.

Verification so far in this session:

- Red run for this session's metadata tests:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_status_cli.ShootFlowProductionStatusCliTests.test_metadata_production_scheduler_command_writes_local_metadata_outputs`
  failed because `run_metadata_production_action` was missing and
  `metadata-production-local` was unsupported.
- Focused green before branch merge:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_status_cli.ShootFlowProductionStatusCliTests.test_metadata_production_scheduler_command_writes_local_metadata_outputs`
  -> 8 tests OK.
- Post-merge focused regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_status_cli tests.test_pilot_cohort_brief tests.test_pilot_cohort_report tests.test_production_scheduler tests.test_render_scheduler tests.test_cli`
  -> 158 tests OK.
- Final review follow-up and full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter && PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 16 metadata adapter tests OK, 375 total tests OK, compileall and
  diff-check exited 0.

Good next test-first targets:

- Add a real proxy-generation adapter behind the same `ProductionWorkerAction`
  boundary, using `metadata-production-local` as the input-fingerprint and
  declared-output safety pattern.
- Bind scheduler reports plus `handoff-controls` into a minimal native-shell CLI
  fixture so UI controls are disabled from the authority payload rather than
  presentation prose.
- Extend metadata adapter coverage to forged succeeded dependencies with missing
  input files across non-proxy stages before media-producing adapters rely on
  those upstream artifacts.

## Branch reconciliation note - 2026-05-10 09:00 UTC

Final reconciliation for this session:

- Started on assigned branch `cursor/repository-branch-consolidation-8b6e`,
  which initially matched `origin/main` at `2ae8935`.
- `git fetch --prune origin` removed historical remote-tracking refs and surfaced
  three live remote branches with useful work:
  `origin/cursor/branch-consolidation-strategy-90f2`,
  `origin/cursor/branch-reconciliation-and-merge-4808`, and
  `origin/cursor/repository-branch-consolidation-3fe2`.
- `origin/cursor/repository-branch-consolidation-3fe2` was the current superset:
  it contained the branch-consolidation strategy work, scheduler report authority
  reconciliation, the `metadata-production-local` adapter, and structured pilot
  cohort readiness blockers. The assigned branch fast-forwarded to that branch's
  `457643c docs: record branch reconciliation` state and was pushed to
  `origin/cursor/repository-branch-consolidation-8b6e`.
- This session then implemented the next documented test-first target on the
  assigned branch: binding cohort readiness blockers into `pilot-cohort-brief`
  JSON/text output for native-shell and GTM presentation, committed as
  `1614af1 feat(pilot): surface cohort brief blockers`.
- A final `git fetch --prune origin` deleted the three reconciled remote branches
  above and surfaced `origin/cursor/branch-consolidation-strategy-afaf`.
  `afaf` is one empty merge commit ahead of `457643c` with the same tree, so it
  contains no useful content beyond what the assigned branch already inherited;
  the assigned branch is one functional commit ahead of it.
- Local `main` was reset to `origin/main` without checking it out, and stale local
  branch `cursor/setup-dev-env-3ad0` was deleted after its upstream was pruned.
- `origin/main` was not checked out or pushed because the Cloud branch
  requirements for this automation require final pushes to
  `cursor/repository-branch-consolidation-8b6e`. Once this branch is merged by
  normal PR automation, `origin/cursor/branch-consolidation-strategy-afaf`
  should be considered redundant because its useful tree is contained here.

## Implementation continuation note - 2026-05-10 09:00 UTC

This run closed the prior cohort-brief blocker-label target:

- `pilot-cohort-brief` summary JSON now exposes structured readiness blocker
  counts for `metrics_unavailable`, `completion_below_threshold`,
  `intervention_above_threshold`, and `materialized_outputs_missing`.
- Each workspace card now exposes validated blocker codes plus controlled human
  labels such as `Completion below threshold` and
  `Manual intervention above threshold`. The labels are generated from an
  internal allowlist, not copied from free-form saved report notes.
- The brief validates any saved cohort-level `readiness_blockers` counts against
  per-workspace evidence and validates per-workspace blocker codes against the
  product's default pilot thresholds before presenting them.
- Text-mode briefs now print controlled blocker labels while continuing to omit
  saved paths, timestamps, workspace titles, free-form threshold notes, and any
  executable workflow commands.
- README, AGENTS, product strategy, business plan, and design decisions now
  record that the brief is the presentation layer for structured blocker counts
  and controlled blocker labels.

Verification for this focused slice:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_cohort_brief`
  failed on missing `summary.readiness_blockers`, missing per-card blocker
  fields, missing text blocker labels, and accepted a forged aggregate blocker
  count.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_cohort_brief`
  -> 18 tests OK, including legacy reports without blocker fields and the
  `materialized_outputs_missing` label path.
- Related pilot/CLI run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_cohort_brief tests.test_pilot_cohort_report tests.test_pilot_dashboard tests.test_cli`
  -> 98 tests OK.
- Full final verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 372 tests OK; compileall and diff-check exited 0.

Good next test-first targets:

- Bind the authority-bearing scheduler reports into a minimal native-shell or
  CLI fixture that runs `workspace-health`, opens a saved scheduler report, then
  validates controls through `handoff-controls`.

  CLI fixture that runs `workspace-health`, opens the saved scheduler report,
  then validates controls through `handoff-controls`.
- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy adapter behind the production-worker action contract,
  using the `metadata-production-local` adapter as the declared-output-only
  pattern and preserving stale lease recovery semantics.
- Add symlink input/output-parent and existing-output conflict coverage around
  `metadata-production-local` before wiring additional media-producing adapters.

## Branch reconciliation note - 2026-05-10 08:30 UTC

Final reconciliation for this session:

- Started on assigned branch `cursor/repository-branch-consolidation-3fe2`,
  which had no committed work ahead of `origin/main` before this session's
  cohort-readiness change.
- `git fetch --prune origin` removed the historical remote-tracking refs and
  left two remote branches with unique work versus `origin/main`:
  `origin/cursor/branch-consolidation-strategy-90f2` (20 commits ahead) and
  `origin/cursor/branch-reconciliation-and-merge-4808` (22 commits ahead).
- `origin/cursor/branch-reconciliation-and-merge-4808` was the superset branch:
  it contained the branch-consolidation strategy work plus the scheduler report
  observe-only authority commit.
- This assigned branch first committed the pilot cohort readiness-blocker work
  as `5d39598 feat(pilot): add cohort readiness blockers`, then merged the
  superset branch with `2932916 Merge remote-tracking branch
  'origin/cursor/branch-reconciliation-and-merge-4808' into
  cursor/repository-branch-consolidation-3fe2`.
- The only merge conflict was `docs/CONTINUATION_NOTES.md`; it was resolved by
  keeping the 08:30 cohort-readiness note, preserving the 08:00/08:05
  reconciliation history from the superset branch, and consolidating the next
  test-first targets.
- Full verification on the merged tree passed:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check --cached && git diff --check`
  -> 369 tests OK; compileall and diff-check passed.
- `origin/main` was not checked out or pushed because the Cloud branch
  requirements for this automation require final pushes to
  `cursor/repository-branch-consolidation-3fe2`. Once this branch is merged by
  normal PR automation, `origin/cursor/branch-consolidation-strategy-90f2` and
  `origin/cursor/branch-reconciliation-and-merge-4808` should be considered
  redundant because their useful work is contained here.

## Implementation continuation note - 2026-05-10 08:30 UTC

This run tightened the pilot cohort analytics trust boundary:

- `pilot-cohort-report` now derives structured readiness blockers for each
  workspace and the cohort aggregate:
  `metrics_unavailable`, `completion_below_threshold`,
  `intervention_above_threshold`, and `materialized_outputs_missing`.
- For metrics-available dashboards, the cohort report validates
  `meets_completion_threshold`, `meets_intervention_threshold`, and
  `meets_output_threshold` against the dashboard's reported rates/output count
  and the product's default pilot acceptance thresholds before trusting
  `ready_for_pilot_review`; dashboard-supplied threshold values must match those
  defaults and cannot relax the policy.
- Forged saved dashboard JSON that claims pilot readiness while a component
  threshold flag fails is rejected at report-build time instead of being
  aggregated into GTM/pilot readiness metrics.
- README, AGENTS, product strategy, business plan, and design decisions now
  record the structured readiness-blocker contract so future Mac UI/GTM work can
  show why a cohort is not ready without parsing free-form threshold notes.

Verification for this focused slice:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_cohort_report`
  failed on missing `readiness_blockers` fields and accepted a forged ready
  dashboard with a failed threshold flag.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_cohort_report`
  -> 11 tests OK after review-driven coverage for repeated blocker counts,
  forged readiness flags, relaxed threshold values, and missing threshold flags.

Good next test-first targets:

- Bind the new cohort `readiness_blockers` fields into `pilot-cohort-brief`
  summary/card JSON if native shells need blocker labels without opening the raw
  cohort report.
- Bind the authority-bearing scheduler reports into a minimal native-shell or
  CLI fixture that runs `workspace-health`, opens the saved scheduler report,
  then validates controls through `handoff-controls`.
- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Branch reconciliation note - 2026-05-10 08:00 UTC

This automation ran on assigned branch
`cursor/branch-reconciliation-and-merge-4808` and reconciled the one remaining
remote branch with unique work:

- `git fetch --prune origin` removed the stale historical remote-tracking refs
  and left `origin/main`, `origin/cursor/branch-reconciliation-and-merge-4808`,
  and `origin/cursor/branch-consolidation-strategy-90f2`.
- `origin/cursor/branch-consolidation-strategy-90f2` was 20 commits ahead of
  `origin/main`. It contained useful completed work: schema v3 observe-only
  scheduler report authority, legacy scheduler-report fallback coverage, the
  `metadata-production-local` adapter, adapter-batch validation, and CLI
  regression tests.
- The assigned branch first shipped a focused scheduler-report authority slice,
  then merged `origin/cursor/branch-consolidation-strategy-90f2` and resolved the
  overlapping authority docs/tests in favor of the consolidated schema v3
  contract.
- During merge resolution, current schema v3 scheduler reports were tightened to
  require root `workflow_authority`, while legacy schema v1/v2 reports still load
  as observe-only for existing saved workspaces.
- Full verification after reconciliation passed:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 363 tests OK; compileall and diff-check passed.
- `origin/main` was not pushed directly in this run because the Cloud branch
  requirements for this automation require final pushes to
  `cursor/branch-reconciliation-and-merge-4808`. Once this branch is merged by
  the normal PR automation, `cursor/branch-consolidation-strategy-90f2` should be
  considered redundant because its useful work is contained here.

## Branch consolidation handoff note - 2026-05-10 08:05 UTC

This automation reconciled the live branch set for the single-worker setup:

- `git fetch --prune origin` removed stale remote-tracking refs and showed the
  live remote had `origin/main` plus one unmerged Cursor branch:
  `origin/cursor/branch-consolidation-1ada`.
- `cursor/branch-consolidation-1ada` was the best current source branch because
  it already contained the scheduler authority schema v3 work, the local
  metadata production adapter, adapter validation fixes, and the latest CLI
  scheduler regression coverage.
- The assigned branch `cursor/branch-consolidation-strategy-90f2` merged that
  source branch with `97e25f1 merge: consolidate branch work` and was pushed to
  `origin/cursor/branch-consolidation-strategy-90f2`.
- Full verification after the merge passed:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 361 tests OK; compileall and diff-check passed.
- After the pushed handoff branch contained the useful work, the redundant
  remote `cursor/branch-consolidation-1ada` and stale local
  `cursor/setup-dev-env-3ad0` branch were deleted. Local `main` was reset to
  track `origin/main`.
- Final branch shape is local `main` plus
  `cursor/branch-consolidation-strategy-90f2`; the remote branch list is
  `origin/main` plus `origin/cursor/branch-consolidation-strategy-90f2` with
  `origin/HEAD` pointing at `origin/main`.

## Branch consolidation note - 2026-05-10 07:00 UTC

This run consolidated the remaining useful branch work onto the assigned branch
`cursor/branch-consolidation-1ada`:

- Started from `2ae8935`, matching `origin/main`.
- Preserved the local metadata production adapter from
  `origin/cursor/repository-branch-consolidation-e334`.
- Preserved the scheduler authority fallback and CLI authority regressions from
  `origin/cursor/branch-consolidation-e152`.
- Folded in the cleaner continuation-note resolution from
  `origin/cursor/branch-reconciliation-and-merge-5098`.
- When `origin/cursor/branch-reconciliation-and-merge-5098` reappeared with a
  new metadata scheduler CLI regression, preserved that fixture here while
  keeping this branch's stricter adapter-batch validation.
- Deleted the superseded remote branches after their useful work was present on
  `cursor/branch-consolidation-1ada`, removed the stale local
  `cursor/setup-dev-env-3ad0`, and reset local `main` to `origin/main`.
- Final branch shape for the single-worker setup is local `main` plus
  `cursor/branch-consolidation-1ada`; the remote branch list is `origin/main`
  plus `origin/cursor/branch-consolidation-1ada` with `origin/HEAD` pointing at
  `origin/main`.

Review follow-up in this run:

- `run_production_adapter_batch(...)` now validates `action_plan` through the
  shared production-adapter validator before reading `worker_adapter`, so invalid
  public caller input fails with `DryRunProductionError` instead of
  `AttributeError`.

Verification in this session:

- Consolidated tree before review follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 359 tests OK; compileall and diff-check passed.
- Final tree after adapter validation follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 360 tests OK; compileall and diff-check passed.
- Final tree after preserving the reappeared metadata scheduler CLI regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 361 tests OK; compileall and diff-check passed.

## Implementation continuation note - 2026-05-10 05:30 UTC

This run shipped the first local metadata production adapter and reconciled the
outstanding scheduler-authority branch into the assigned branch:

- Added `metadata-production-local`, a local production adapter that consumes the
  existing trusted production-worker action contract, claims jobs through
  `production_status.json`, fingerprints real local input files, writes
  deterministic metadata JSON only to declared output files, and reports success
  or retryable status through the guarded compare/write boundary.
- Added `run_production_adapter_batch(...)` so the scheduler can dispatch local
  production adapters by name. `dry-run-production-local` remains the placeholder
  adapter; `metadata-production-local` is now discoverable through
  `supported_production_adapter_names()` and batch-runnable by the scheduler.
- Hardened metadata input handling after review: absolute inputs must stay under
  the workspace, manifest-relative inputs that already include the workspace
  prefix are normalized, ordinary workspace-relative inputs win over colliding
  process-cwd files, missing extensionless file inputs become retryable instead
  of being mistaken for literals, and file metadata is read from one no-follow
  descriptor with the same `fstat` size used for the output.
- Merged `origin/cursor/repository-branch-consolidation-f53c`, preserving its
  schema v3 observe-only `workflow_authority` work for persisted production and
  render scheduler reports. The metadata-adapter docs and the scheduler-authority
  docs were reconciled in AGENTS and product strategy.
- Updated README, AGENTS, business plan, product strategy, and design decisions
  to describe the new local adapter boundary without implying copy, overwrite,
  cleanup, deletion, or arbitrary materialization authority.

Verification in this session:

- Red metadata-adapter tests first failed because the API did not exist.
- Review-found regression tests first failed for missing extensionless inputs,
  trusted absolute inputs, relative manifest inputs, and cwd-collision
  workspace-relative inputs.
- Focused green run before reconciliation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_production_status_cli`
  -> 35 tests OK.
- Full green run before reconciliation:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 354 tests OK; compileall and diff-check passed.
- Post-merge focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_production_adapter tests.test_production_scheduler tests.test_render_scheduler tests.test_production_status_cli tests.test_cli`
  -> 122 tests OK.
- Post-merge full green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 356 tests OK; compileall and diff-check passed.

## Branch reconciliation note - 2026-05-10 05:30 UTC

Final reconciliation for this session:

- The assigned branch `cursor/repository-branch-consolidation-e334` started at
  `2ae8935`, matching `origin/main`.
- `git fetch --prune origin main` showed exactly two remote branches with unique
  commits versus `origin/main`: `origin/cursor/repository-branch-consolidation-f53c`
  and `origin/cursor/branch-consolidation-f0b0`.
- `origin/cursor/repository-branch-consolidation-f53c` contained useful
  scheduler-authority code/tests/docs. It was merged into the assigned branch via
  `e68c339 merge: reconcile scheduler authority branch`; conflicts in AGENTS and
  product strategy were resolved by keeping both the schema v3 report authority
  decision and this session's metadata-adapter boundary.
- `origin/cursor/branch-consolidation-f0b0` was reviewed and not merged. Its
  unique diff is only a stale continuation note claiming the remote branch set
  contains only main plus that assigned branch; the live remote now contains many
  historical branches plus this assigned branch, so merging it would make the
  continuity log inaccurate.
- `origin/cursor/branch-consolidation-e152` later contributed useful regression
  coverage for legacy scheduler-report authority fallback and missing handoff
  authority rejection. Those tests were preserved when this branch was
  reconciled; its older branch-count notes were superseded by this combined
  continuation note.
- Useful completed work is now consolidated on the assigned branch. `main` was
  not checked out, modified, or pushed because the Cloud branch instructions for
  this automation require final pushes only to
  `cursor/repository-branch-consolidation-e334`.

Good next test-first targets:

- Add a CLI-level metadata production scheduler fixture that runs from a real
  saved ingest manifest through `init-production-status` and
  `dry-run-production-scheduler --worker metadata-production-local`.
- Add direct metadata-adapter coverage for symlinked input files, symlinked
  output parents, matching existing outputs, and different existing outputs.
- Decide the first real media-producing adapter boundary after metadata:
  ffmpeg proxy generation, Core Image/Metal look preview, or Resolve handoff.
## Implementation continuation note - 2026-05-10 04:00 UTC

This run resolved the open scheduler-authority question for persisted scheduler
reports:

- Production and render scheduler reports now write schema version 3 with a root
  observe-only `workflow_authority` object alongside the existing validated
  `product_metrics`.
- `DryRunProductionSchedulerReport` and `DryRunRenderSchedulerReport` now carry
  the validated authority payload in memory. Loaders synthesize observe-only
  authority for legacy schema v1/v2 reports so existing saved demo/pilot
  workspaces remain readable without granting file-operation authority.
- CLI `--print-report` output for both dry-run schedulers now emits the same
  schema v3 authority-bearing report JSON as the persisted report. Higher-level
  UI handoff summaries remain schema v2 unless their own contract changes.
- Added scheduler-loader regressions proving authorizing
  `workflow_authority` in persisted production/render scheduler reports is
  rejected with the same fail-closed authority validation used by UI handoffs.
- Updated `docs/WORKFLOW_AUTHORITY.md`, README, strategy, design notes, and
  AGENTS guidance to make the decision durable for future native-shell work.

Verification in this session:

- Red run proved scheduler report writers still emitted schema v2 and loaded
  report objects lacked `workflow_authority`.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_render_scheduler tests.test_production_scheduler tests.test_cli.ShootFlowCliTests.test_persisted_cli_demo_workspace_runs_init_to_scheduler_report tests.test_cli.ShootFlowCliTests.test_dry_run_scheduler_command_writes_and_prints_report tests.test_cli.ShootFlowRenderTaskCliTests.test_write_render_tasks_command_persists_trusted_assembly_handoff tests.test_production_status_cli.ShootFlowProductionStatusCliTests.test_dry_run_production_scheduler_command_can_print_persisted_report`
  -> 38 tests OK.
- Independent code review found no blocking issues and suggested the
  scheduler-specific malformed-authority regression tests added in
  `5e25427 test(scheduler): reject authorizing report authority`.
- Full verification after final test commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 348 tests OK; compileall and diff-check passed.

## Branch reconciliation note - 2026-05-10 04:00 UTC

Final reconciliation for this session:

- `git fetch --prune origin main cursor/repository-branch-consolidation-f53c`
  succeeded after the assigned branch was first pushed.
- Remote comparison against `origin/main` found exactly one branch with unique
  commits: `origin/cursor/repository-branch-consolidation-f53c`, ahead by this
  session's scheduler authority commits.
- No other remote branch had unique work versus `origin/main`; historical
  branches are either contained in main or behind it.
- Local `main` was fast-forwarded in place to `origin/main` without checking it
  out, and the stale local `cursor/setup-dev-env-3ad0` branch was deleted after
  confirming it was contained.
- Useful completed work remains on the assigned branch and was not pushed
  directly to `main` because the Cloud branch instructions for this automation
  require final pushes only to `cursor/repository-branch-consolidation-f53c`.

## Branch reconciliation note - 2026-05-10 03:30 UTC

Final reconciliation for this session:

- The assigned branch `cursor/branch-reconciliation-and-merge-21b0` started at
  `8bd511f`, matching `origin/main`.
- `git fetch --prune origin` removed the historical automation branches and
  surfaced two remaining branches with unique work:
  `origin/cursor/branch-consolidation-e6be` and
  `origin/cursor/repository-branch-consolidation-11b5`.
- `origin/cursor/repository-branch-consolidation-11b5` was the superset branch,
  containing the authority-reader work from `e6be` plus the read-only
  `handoff-controls` CLI bridge. The assigned branch fast-forwarded to
  `51bb05b docs: record handoff controls reconciliation` and was pushed.
- After fresh verification, local `main` was reset to `origin/main`,
  fast-forwarded to the same `51bb05b` tree, and pushed to `origin/main`.
  Useful completed work is no longer stranded outside main.
- Final remote reconciliation after the main push showed no remote branch with
  unique work versus `origin/main`: `origin/cursor/branch-reconciliation-and-merge-21b0`
  and `origin/cursor/repository-branch-consolidation-11b5` match main, while
  `origin/cursor/branch-consolidation-e6be` is contained and behind by the CLI
  bridge commits.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after its upstream had
  been pruned.

## Implementation continuation note - 2026-05-10 03:30 UTC

This run reconciled and shipped the completed authority-control integration:

- Imported the fail-closed native-shell handoff reader
  `observe_only_handoff_controls_to_dict(...)`, which validates root
  observe-only `workflow_authority` before returning disabled file-operation
  controls for mutation, copy, retry, cleanup, overwrite, materialization, and
  deletion.
- Imported the read-only
  `python -m shootflow.cli handoff-controls --handoff-json <path>` bridge so
  shell/native integrations can validate saved handoff JSON without parsing
  `next_actions`, `next_steps`, `writes_files`, `agent_handoff`, or prose as
  permission.
- Fixed a review-found fail-closed gap in the CLI bridge: invalid UTF-8 or
  unreadable handoff JSON now returns the normal CLI error path instead of
  escaping as `UnicodeDecodeError`, `PermissionError`, or another `OSError`.
- Preserved the new `docs/WORKFLOW_AUTHORITY.md` contract and README/AGENTS/
  design-decision references as the canonical guidance for future SwiftUI,
  menu-bar, or automation consumers.

Verification in this session:

- Red review follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_invalid_utf8_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_unreadable_json`
  reproduced uncaught `UnicodeDecodeError` and `PermissionError`.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_invalid_utf8_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_unreadable_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  -> 4 tests OK.
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests`
  -> 346 tests OK.
- `PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests`
  -> passed.
- `git diff --check` -> passed.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- When native SwiftUI/menu-bar code appears, make its file-operation controls
  consume either `observe_only_handoff_controls_to_dict(...)` directly or the
  `handoff-controls` CLI output before exposing retry/copy/materialization UI.

## Branch reconciliation note - 2026-05-10 03:00 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/repository-branch-consolidation-11b5` first
  merged the only remote branch with useful unmerged work,
  `origin/cursor/branch-reconciliation-and-merge-9840`, via merge commit
  `ceeae16 merge: reconcile authority reader branch`.
- This session then added `0b277f1 feat(cli): add handoff control validator`,
  bringing the assigned branch to four commits ahead of `origin/main`: the two
  authority-reader commits from `9840`, the merge commit, and the new CLI bridge.
- After `git fetch --prune origin`, remaining remote branch comparison was:
  `origin/cursor/branch-consolidation-08bd` is behind `origin/main` with no
  unique work, `origin/cursor/branch-reconciliation-and-merge-e71e` matches
  `origin/main`, `origin/cursor/branch-reconciliation-and-merge-9840` has the two
  authority-reader commits now merged into this assigned branch, and
  `origin/cursor/repository-branch-consolidation-11b5` is the only branch with
  this session's new unique work.
- Local `main` was reset in place to `origin/main`, and stale local
  `cursor/setup-dev-env-3ad0` was deleted. Remote branch deletion/main pushing
  was not performed because the Cloud branch instructions for this automation
  require final pushes only to `cursor/repository-branch-consolidation-11b5`.

## Implementation continuation note - 2026-05-10 03:00 UTC

This run converted the new authority reader into a shell/native integration
bridge:

- Added `python -m shootflow.cli handoff-controls --handoff-json <path>`.
  The command is read-only: it refuses symlinked handoff JSON, loads a saved
  object payload, validates the root observe-only `workflow_authority` through
  `observe_only_handoff_controls_to_dict(...)`, and prints schema v2 JSON with
  the shared observe-only authority plus all-disabled `handoff_controls`.
- Added CLI tests proving saved handoff JSON with write-capable presentation
  fields still yields disabled controls, and authorizing root authority fails
  closed with the shared `WorkflowAuthorityError` message.
- Updated README, AGENTS, `docs/WORKFLOW_AUTHORITY.md`, and design decisions so
  future SwiftUI/menu-bar shells can use the CLI bridge when they have a saved
  handoff file instead of importing Python directly.

Verification and review:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  failed because `handoff-controls` was not an argparse choice.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  -> 5 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 344 tests OK; compileall and diff-check passed.
- Code-review subagent found no blocking or non-blocking issues. Residual test
  gap accepted: missing-root/prose ignoring behavior is covered at the shared
  helper level rather than duplicated through the CLI wrapper.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- When native SwiftUI/menu-bar code appears, make its file-operation controls
  consume either `observe_only_handoff_controls_to_dict(...)` directly or the
  `handoff-controls` CLI output before exposing retry/copy/materialization UI.

## Branch reconciliation note - 2026-05-10 02:30 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/branch-reconciliation-and-merge-9840` contains
  the new authority-reader work and is one commit ahead of `origin/main` after
  commit `916d40c feat(authority): add observe-only handoff control reader`.
- Remote branch comparison after `git fetch origin main
  cursor/branch-reconciliation-and-merge-9840` showed every remote branch except
  `origin/cursor/branch-reconciliation-and-merge-9840` has `ahead=0` relative to
  `origin/main`; those branches contain no unique unmerged work to reconcile in
  this session. `origin/cursor/branch-consolidation-08bd` remains behind main
  with no unique commits.
- Local `main` was reset in place to `origin/main` without checking it out, and
  the merged local `cursor/setup-dev-env-3ad0` branch was deleted.
- The useful completed work is pushed to the assigned branch. It was not pushed
  directly to `main` because the Cloud branch instructions for this run require
  all final pushes to target `cursor/branch-reconciliation-and-merge-9840` and
  prohibit pushing a different branch without explicit override.

## Implementation continuation note - 2026-05-10 02:30 UTC

This run implemented the first consumer-side authority reader for native shells
and agents:

- Added `observe_only_handoff_controls_to_dict(...)` in
  `shootflow.workflow_authority`. The helper validates a handoff's root
  observe-only `workflow_authority` object and returns all-disabled native
  file-operation controls for file mutation, copy, retry, cleanup, overwrite,
  materialization, and deletion.
- Added focused tests in `tests/test_workflow_authority.py` proving that
  `next_actions`, `next_steps`, `writes_files`, `agent_handoff`, and prose do
  not enable native controls, and that missing or authorizing root authority
  fails closed with `WorkflowAuthorityError`.
- Added `docs/WORKFLOW_AUTHORITY.md` plus README, AGENTS, and design-decision
  references so future SwiftUI/menu-bar shells bind controls to the helper's
  disabled output rather than parsing presentation fields.

Verification and review:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority`
  failed on the missing `observe_only_handoff_controls_to_dict` API.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority tests.test_pilot_dashboard tests.test_pilot_cohort_report tests.test_pilot_cohort_brief tests.test_workspace_health tests.test_workspace_index`
  -> 54 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 342 tests OK; compileall and diff-check passed.
- Review pass found no blocking issues. Residual risk: the reader is intentionally
  exact-shape observe-only; a future non-observe action contract will need a new
  explicit schema/helper rather than adding permissions to this one.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Bind the new authority reader into any future native SwiftUI/menu-bar readout
  before exposing retry/copy/materialization controls.

## Branch reconciliation note - 2026-05-10 02:00 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/branch-reconciliation-and-merge-e71e`
  fast-forwarded in the useful completed work from
  `origin/cursor/repository-branch-consolidation-ec92`:
  - `bf14814 feat(cli): add authority to handoff summaries`
  - `daedff5 test(cli): cover authority on ingest planning summaries`
  - `5851407 docs: record cli authority reconciliation`
- This session then added a review follow-up on the assigned branch:
  versioned observe-only authority on `execute-ingest` receipts, schema v2 for
  `plan-import-route` and `preview-ingest`, and command-free write-capable
  `next_actions` for `write-render-tasks` and `card-dump-workflow`.
- A final `git fetch --prune origin` removed the older remote branches
  `origin/cursor/branch-reconciliation-and-merge-030b`,
  `origin/cursor/branch-consolidation-0f1f`, and
  `origin/cursor/repository-branch-consolidation-ec92`. A replacement
  `origin/cursor/branch-consolidation-08bd` remains and points at `5851407`,
  which is fully contained in this branch and now in `origin/main`.
- Local `cursor/setup-dev-env-3ad0` was deleted after pruning its gone remote.
- Local `main` was reset to `origin/main`, fast-forwarded to
  `cursor/branch-reconciliation-and-merge-e71e`, verified, and pushed. Useful
  completed work is no longer stranded outside main.

## Implementation continuation note - 2026-05-10 02:00 UTC

This run extended the machine-readable no-authority contract across the
remaining high-risk CLI handoff summaries and ingest receipts that can otherwise
be misread from `next_actions`, `next_steps`, or `agent_handoff`:

- `plan-production` and `next-production-wave` JSON now use schema v2 and include
  root `workflow_authority`, so native shells can show candidate pre-render
  work without granting claim, retry, materialization, cleanup, overwrite,
  deletion, copy, or general file-mutation authority.
- `write-render-tasks`, `card-dump-workflow`, `inspect-render-workspace`,
  `create-demo-workspace`, `create-card-dump-demo-workspace`, and
  `create-pilot-cohort-demo` summaries now use the shared schema-v2 CLI handoff
  constant and emit root observe-only authority before naming advisory workflow
  steps.
- `plan-import-route` and `preview-ingest` now use schema v2 plus root
  observe-only authority. They remain read-only planning/preview surfaces; the
  actual copy path still requires a separate explicit `execute-ingest --confirm`
  or `card-dump-workflow --confirm-ingest` invocation.
- `execute-ingest` success receipts now also use schema v2 and root
  observe-only authority. The authority describes the receipt payload as a
  non-authorizing post-copy handoff; it does not erase the fact that the command
  already copied bytes after explicit `--confirm`.
- `write-render-tasks` and confirmed `card-dump-workflow` no longer emit
  executable `command` arrays inside write-capable `next_actions`. They carry
  descriptive fields such as workspace, completed dependency IDs, and ingest
  manifest path so native shells can render reviewed next steps without treating
  the JSON as an executable workflow plan.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future native shells and continuation agents treat root `workflow_authority`
  as the permission gate for these summaries.

Verification and review:

- Imported branch verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli`
  -> 61 tests OK.
- Review pass found two contract gaps: `execute-ingest` lacked schema/authority,
  and observe-only payloads still emitted executable command arrays for
  write-capable next actions.
- Red focused run before the review follow-up failed on the intended missing
  fields/command-free expectations.
- Green focused run after the review follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_plan_import_route_command_discovers_capacity_gated_route_from_estimated_source tests.test_cli.ShootFlowIngestCliTests.test_preview_ingest_command_outputs_planned_items_without_copying tests.test_cli.ShootFlowIngestCliTests.test_execute_ingest_command_with_confirm_writes_checksum_manifest tests.test_cli.ShootFlowRenderTaskCliTests.test_write_render_tasks_command_persists_trusted_assembly_handoff tests.test_cli.ShootFlowCardDumpWorkflowCliTests.test_card_dump_workflow_confirm_ingests_and_reports_production`
  -> OK.

Good next test-first targets:

- Add a tiny native-shell/agent contract reader that refuses to enable copy,
  retry, materialization, cleanup, overwrite, or deletion controls from
  `next_actions`, `next_steps`, `writes_files`, or prose unless a separate
  explicit reviewed action contract is present.
- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Branch reconciliation note - 2026-05-10 00:00 UTC

Final reconciliation for this session:

- `origin/cursor/branch-reconciliation-and-merge-cb17` contains the useful
  workspace-authority implementation plus the review follow-up that normalizes
  legacy schema v1 workspace indexes into schema v2 with both root and nested
  observe-only authority fields.
- `origin/cursor/branch-consolidation-b632` was reviewed against this branch.
  Its unique tree diff was only an additional continuation-note section. That
  note was not merged because it documented the pre-fix authority commit
  (`c4e73a2`) as final, omitted the legacy-index fix (`c59e7f6`), and claimed
  remote branch deletions that were not true in the current reconciliation pass.
  No implementation or test work was stranded there.
- After `git fetch --prune origin`, all historical remote automation branches
  except `origin/cursor/branch-consolidation-b632` and the assigned branch were
  already gone. Local `cursor/setup-dev-env-3ad0` remains a stale gone-upstream
  branch and can be deleted after the final main fast-forward if still present.

## Implementation continuation note - 2026-05-10 00:00 UTC

This run broadened the structured observe-only authority contract beyond the
pilot analytics layer into the read-only workspace state surfaces:

- Added `shootflow.workflow_authority`, the shared no-authority helper for
  UI/agent contracts. `shootflow.pilot_authority` remains as a compatibility
  wrapper over the shared module, so existing pilot consumers keep the same API.
- `workspace-health` JSON now uses schema v4 and includes
  `workflow_authority` at the top level. The payload still may name suggested
  next actions, including write-capable commands for human review, but the
  serialized contract explicitly grants no copy, retry, cleanup, overwrite,
  materialization, deletion, or file-mutation authority.
- `index-workspace` JSON now uses schema v2, includes the same
  `workflow_authority` at the root, and embeds the derived workspace-health
  authority inside the `workspace_health` artifact summary. Persisted schema v1
  indexes still load as observe-only for backward compatibility.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future native shells treat `workflow_authority` as the first safety gate
  across workspace health, workspace index, pilot dashboard, cohort report, and
  cohort brief payloads.

Verification during implementation:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workspace_health tests.test_workspace_index`
  failed on missing workspace-health/index authority fields and old schema
  versions.
- Green focused run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workspace_health tests.test_workspace_index`
  -> 25 tests OK.
- Pilot authority regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard tests.test_pilot_cohort_report tests.test_pilot_cohort_brief`
  -> 25 tests OK.

Good next test-first targets:

- Bind `workflow_authority` into any future native SwiftUI/menu-bar readout or
  shell wrapper before exposing retry/copy/materialization controls.
- Add agent/UI contract coverage around `card-dump-workflow` `agent_handoff` so
  copy-capable next steps are never inferred from prose or command strings.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 23:30 UTC

This run hardened the observe-only pilot analytics/UI contract for future native
shells and continuation agents:

- Added `shootflow.pilot_authority`, a shared structured
  `workflow_authority` payload for pilot presentation surfaces. The contract is
  `mode=observe_only`, `handoff_kind=presentation_only`, and false for file
  mutation, copy, retry, cleanup, overwrite, materialization, and deletion.
- `pilot-dashboard`, `pilot-cohort-report`, and `pilot-cohort-brief` JSON now
  emit that same authority object. This makes the trust boundary machine-readable
  for agent-native UIs instead of leaving consumers to parse safety-note prose.
- Saved dashboard JSON and saved cohort reports remain backward-compatible when
  the field is absent, but if a saved payload includes `workflow_authority`, the
  loaders validate it and reject malformed or authorizing values instead of
  silently masking them.
- Cohort reports and briefs still emit no executable workflow commands. The
  text-mode cohort brief remains command-free and continues omitting saved paths,
  timestamps, workspace titles, and free-form report notes.
- Updated README, AGENTS, product strategy/architecture/business docs to treat
  `workflow_authority` as the first safety gate for future Mac UI controls.

Review, verification, and branch reconciliation for this run:

- Test-first red run failed on missing `workflow_authority` in dashboard, cohort
  report, and cohort brief JSON. Implementation added the shared authority
  helper and serializers.
- Focused review found two issues: numeric zero could pass as `False`, and saved
  payloads with a malformed present authority block were silently masked. A
  follow-up red run reproduced both gaps; the validator now requires exact bool
  values and report loaders reject malformed present authority fields.
- Verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 337 tests OK; compileall and diff-check exited 0.
- Commit pushed to the assigned branch:
  `09ec3bc feat(pilot): expose observe-only authority contract`.
- `git fetch --prune origin` removed historical remote automation branches.
  After pruning, only `origin/cursor/branch-reconciliation-and-merge-c0a6` had
  unique work versus `origin/main`; `origin/cursor/branch-consolidation-strategy-adee`
  and `origin/cursor/repository-branch-consolidation-471c` were already merged.
- Fast-forwarded local `main` to `origin/main`, fast-forwarded `main` to the
  assigned branch tip, and pushed `origin/main`. After that compare, every
  surviving remote branch had `ahead=0` versus `origin/main`.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` whose upstream was gone.
  Kept the assigned automation branch because it tracks the just-pushed feature
  branch and is now merged into `main`.

Good next test-first targets:

- Broaden UI/agent contract coverage so `workspace-health`, `workspace-index`,
  and future native wrappers also expose or respect explicit no-authority fields
  before presenting write-capable controls.
- Bind the command-free text cohort brief plus structured JSON authority into a
  tiny native SwiftUI/menu-bar readout or shell wrapper that shows readiness
  cards while invoking only explicit, reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 23:00 UTC

This run closed the prior text-mode/native-shell cohort brief target:

- Added `pilot_cohort_brief_to_text(...)`, a deterministic text renderer over the
  validated saved cohort brief. It reports status, headline, trusted summary
  counts, and per-workspace readiness cards for terminal demos and native-shell
  readouts.
- Added `pilot-cohort-brief --format text` while preserving JSON as the default
  output for existing agents and integrations.
- Hardened the text surface so it omits free-form cohort and threshold notes from
  saved reports; JSON still carries the structured note fields, but the text demo
  cannot echo injected `python -m ...` or `--confirm` style workflow handoffs.
- A final review pass found the same risk in saved report paths, workspace
  titles, and dashboard paths. The text view now omits those free-form fields too
  and uses ordinal workspace labels instead.
- A re-review found the same risk in saved `generated_at` strings. The text view
  now omits that timestamp field too; JSON remains the complete machine-readable
  contract.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  to treat the text-mode brief as the command-free presentation layer over saved
  cohort reports.

Review and branch reconciliation for this run:

- Test-first red run failed on the missing renderer and missing `--format text`
  CLI option; a follow-up hardening red run failed because free-form notes were
  echoed into text output.
- Review-follow-up red run failed because free-form saved paths and workspace
  titles were echoed into text output.
- Re-review-follow-up red run failed because a free-form saved `generated_at`
  string was echoed into text output.
- Verification before the first commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 333 tests OK; compileall and diff-check exited 0.
- Commit pushed to the assigned branch:
  `51cab65 feat(pilot): add text cohort brief output`.
- `git fetch --prune origin` removed historical remote automation branches. The
  only newly visible branch, `origin/cursor/branch-consolidation-strategy-adee`,
  had no unique work beyond the previous `origin/main` tip.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Fast-forwarded local `main` to `origin/main`, then fast-forwarded `main` to the
  assigned branch tip and pushed `origin/main`. After reconciliation,
  `origin/main...HEAD` compared `0 0` and no remote branches remained unmerged
  into `origin/main`.

Good next test-first targets:

- Bind the command-free text cohort brief into a tiny native SwiftUI/menu-bar
  screen or shell wrapper that displays readiness cards while invoking only
  explicit, reviewed next-action contracts.
- Add UI/agent contract tests proving text brief, JSON brief, cohort reports, and
  dashboards never become permission to retry, materialize, overwrite, clean up,
  or delete files.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 22:30 UTC

This run advanced the native-shell/UI proof target above the saved cohort
fixture:

- Added `shootflow.pilot_cohort_brief`, a read-only presentation contract over
  one saved schema v1 `pilot_cohort_report.json`.
- Added `pilot-cohort-brief --cohort-report <path>` to emit status, headline,
  summary labels, and per-workspace readiness cards for Mac shells, GTM demos,
  and continuation agents.
- The brief preserves the analytics trust boundary: it reads only the saved
  cohort report, writes nothing, emits no executable workflow commands, and does
  not grant copy, retry, cleanup, overwrite, materialization, or deletion
  authority.
- Added regression coverage for partially ready cohorts, unavailable trusted
  metrics, and CLI no-write/no-command behavior.
- Review follow-up tightened saved-report validation: the brief now rejects
  forged or internally inconsistent cohort reports whose aggregate counts,
  readiness booleans, rates, medians, or output counts disagree with workspace
  evidence. A second review pass tightened this further by recomputing
  workspace readiness from the default completion/intervention/output thresholds
  and revalidating nested summary dataclasses, status, and headline consistency
  before serialization.

Good next test-first targets:

- Bind the cohort brief into a small native SwiftUI/menu-bar screen or text-mode
  demo harness that displays readiness cards while invoking only explicit,
  reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving cohort dashboards, cohort reports, and
  cohort briefs never become permission to retry, materialize, overwrite, clean
  up, or delete files.

## Implementation continuation note - 2026-05-09 22:00 UTC

This run advanced the saved-dashboard cohort fixture target from the previous
handoff:

- Added `create-pilot-cohort-demo --workspace <dir> --workspace-count <n>
  --dashboard-generated-at <timestamp> --generated-at <timestamp>`.
- The command creates trusted persisted render demo workspaces under
  `workspaces/`, runs the normal render init and dry-run scheduler path for each
  workspace, saves one schema v2 pilot-dashboard JSON payload per workspace under
  `pilot_dashboards/`, and writes a saved `pilot_cohort_report.json`.
- The fixture preflights saved dashboard/report paths before creating shoot
  workspaces, refuses existing different report files, and keeps saved dashboards
  plus cohort reports observational rather than workflow authority.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents can treat the saved cohort fixture as the no-real-media GTM
  demo path above `pilot-dashboard` and `pilot-cohort-report`.

Review and branch reconciliation for this run:

- Independent code review found that a reused
  `workspaces/pilot-demo-001/deliverables/render_scheduler_report.json` could be
  overwritten by the scheduler report writer. Fixed by preflighting and refusing
  any existing per-shoot pilot demo workspace before scheduling, with regression
  coverage proving no saved dashboard/cohort files are written and the existing
  report is preserved.
- Fetched and pruned remotes. The historical automation branches were deleted
  upstream; the newly visible `origin/cursor/branch-consolidation-strategy-253b`
  compared `0 0` with `origin/main` and contained no unique work.
- The only branch ahead of `origin/main` was the assigned branch
  `cursor/branch-reconciliation-and-merge-4b9f` with this run's two commits.
  Local `main` was fast-forwarded to the verified branch tip and pushed to
  `origin/main`.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Final compare after push: `origin/main...HEAD` and
  `origin/cursor/branch-reconciliation-and-merge-4b9f...HEAD` both returned
  `0 0`; no remote branches remain unmerged into HEAD or `origin/main`.
- Final verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 321 tests OK;
  compileall/diff-check exited 0 and the working tree was clean before this
  documentation note.

Good next test-first targets:

- Bind the saved cohort fixture into a minimal native-shell/UI proof that
  displays readiness, intervention, and throughput as observational state while
  still branching only on explicit reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving cohort dashboards never become permission
  to retry, materialize, overwrite, clean up, or delete files.

## Implementation continuation note - 2026-05-09 21:30 UTC

This run advanced the pilot cohort measurement target from the previous handoff:

- Added `shootflow.pilot_cohort_report`, a read-only aggregation layer over saved
  schema v2 `pilot-dashboard` JSON payloads. It validates each dashboard payload
  and derives cohort-level pilot-ready workspace rate, median intervention rate,
  first-draft output count, metrics-available/unavailable counts, and
  per-workspace readiness evidence.
- Added `pilot-cohort-report --dashboard-json <path> ... --generated-at
  <timestamp>` to the CLI. It writes nothing, consumes dashboard JSON files
  instead of shoot workspaces or worker internals, and emits no workflow
  commands.
- Missing dashboard metrics stay unavailable and are excluded from rate/median
  calculations rather than becoming false pilot successes or failures.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents treat cohort analytics as the next pilot measurement layer
  above per-workspace dashboards.

Good next test-first targets:

- Bind schema v2 `pilot_acceptance` and cohort-report output into a minimal
  native-shell/UI fixture that displays readiness as observational state while
  still branching only on explicit next-action/review contracts.
- Add a saved-dashboard fixture flow that writes one dashboard JSON per demo
  workspace and then runs `pilot-cohort-report`, giving GTM demos a stable
  multi-workspace cohort artifact without requiring real media.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 21:00 UTC

This run advanced the pilot-dashboard measurement target from the previous
handoff:

- `shootflow.pilot_dashboard` now emits schema version 2 with a
  `pilot_acceptance` object derived only from trusted workspace-health scheduler
  metrics. It computes completion and manual-intervention rates as integer basis
  points, carries the default thresholds in the payload, and marks
  `ready_for_pilot_review` only when completion is at least 90%, manual
  intervention is at most 20%, and at least one declared output has materialized.
- Missing or invalid scheduler metrics keep pilot acceptance unavailable rather
  than silently treating unknown values as success or failure.
- Acceptance state is explicitly observational. It does not schedule, retry,
  materialize, repair, overwrite, clean up, delete files, or re-emit executable
  write-capable next actions.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents and GTM work treat schema v2 pilot readiness as the canonical
  measurement layer instead of raw worker logs or spreadsheets.
- Added dashboard coverage for passing render-workspace readiness, retryable
  production intervention/completion failure, missing-metric unavailability,
  blocked no-output reports, and completed-workspace no-op scheduler reruns.

Branch reconciliation for this run:

- Fetched and pruned remote branches. Most historical automation branches were
  already deleted upstream.
- The assigned branch started equal to `origin/main` and
  `origin/cursor/branch-reconciliation-and-merge-9ad3`.
- `origin/cursor/repository-branch-consolidation-6ce3` and
  `origin/cursor/branch-consolidation-fedb` are behind this lineage with no
  unique commits (`HEAD...branch` compared `2 0` and `4 0` respectively), so no
  remote merge was needed.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard`
  -> 5 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 312 tests OK; compileall/diff-check exited 0.

Good next test-first targets:

- Bind schema v2 `pilot_acceptance` into a minimal native-shell/UI fixture that
  displays readiness as observational state while still branching only on
  explicit next-action/review contracts.
- Define a pilot cohort report fixture that aggregates multiple dashboard JSON
  payloads into pilot-ready workspace rate, median intervention rate, and
  first-draft output count without reading raw worker internals.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 20:30 UTC

This run closed the pilot-dashboard contract target from the previous handoff:

- Added `shootflow.pilot_dashboard`, a read-only product analytics layer over
  `workspace-health`. It reports metric-source availability, activation signals,
  aggregate throughput, manual-intervention counts, and the current next action
  without reading raw worker internals.
- Added `pilot-dashboard --workspace <dir> --generated-at <timestamp>` to the
  CLI. Its JSON output is deterministic and observe-only. For write-capable
  next actions, it names the action and `writes_files` flag but omits executable
  `command` and runtime-arg fields so analytics surfaces cannot become
  schedulers, retry runners, or materializers.
- Missing or invalid scheduler reports leave throughput/intervention counts
  unavailable (`null`) rather than treating unknown metrics as zero.
- Added coverage for complete render dashboards, production retry/review
  dashboards, and missing-metrics dashboard state. A code-review pass caught the
  initial executable-command leak in the dashboard payload; the follow-up fix
  added an observe-only next-action view.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  to treat `pilot-dashboard` as implemented pilot analytics infrastructure.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The assigned branch started equal to
  `origin/main` and `origin/cursor/repository-branch-consolidation-6ce3`.
- `origin/cursor/branch-consolidation-fedb` remains behind this lineage with no
  unique commits and was not merged.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after confirming it was
  merged into the assigned branch.
- Pushed the assigned branch, fast-forwarded local `main` to the same tree, and
  pushed `origin/main`; both `origin/main...HEAD` and
  `origin/cursor/branch-reconciliation-and-merge-9ad3...HEAD` compare `0 0`.
- Final verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard &&
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 3 targeted tests OK, 312 tests OK; compileall/diff-check
  exited 0.

Good next test-first targets:

- Bind `pilot-dashboard` into a minimal native-shell/UI fixture that proves Mac
  surfaces display intervention and throughput metrics as observational state,
  while still branching only on explicit next-action/review contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Define pilot acceptance thresholds for activation, intervention rate, and
  first-draft throughput using the dashboard payload rather than raw worker
  internals.

## Implementation continuation note - 2026-05-09 20:00 UTC

This run advanced the metrics-consumption target from the previous handoff:

- `workspace-health` now exposes validated production and render scheduler
  `product_metrics` as read-only JSON fields when matching trusted scheduler
  reports are present. Missing or invalid reports leave those metric fields
  unavailable instead of deriving analytics from untrusted files.
- `index-workspace` now carries the same metrics in its derived
  `workspace_health` artifact and includes each trusted production/render
  scheduler report's `product_metrics` in that report artifact summary.
- Metrics remain observational only: next-action routing still depends on the
  validated status/report state, not on metric counts, and no copy, retry,
  cleanup, overwrite, materialization, or deletion authority was added.
- Added regression coverage for render and production health payloads plus
  workspace-index scheduler summaries/CLI output.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The many historical cursor branches from
  earlier runs had already been removed upstream after prior consolidation.
- The newly visible `origin/cursor/branch-consolidation-fedb` had no unique
  commits beyond the verified baseline; comparing it to this branch returned
  `1 0`, so it is simply behind this run's metrics-consumption commit and was
  not merged separately.
- Before the final main fast-forward, `origin/main...HEAD` compared `0 1`: the
  only new useful work was this run's focused workspace health/index metrics
  exposure commit.
- Final verification before merge/push:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 309 tests OK; compileall/diff-check exited 0.

Good next test-first targets:

- Add UI/agent contract tests proving Mac shells render metric counts as
  reliability/throughput indicators while continuing to branch on explicit
  review states for retryable jobs, lease conflicts, and invalid artifacts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Define the first pilot dashboard contract that consumes health/index metrics
  for activation, intervention rate, and throughput without reading raw worker
  internals.

## Implementation continuation note - 2026-05-09 19:30 UTC

This run advanced the product-metrics target that had been carried in the
handoff notes:

- Production and render scheduler reports now write schema version 2 with a
  `product_metrics` object derived from the trusted report/status fields.
  Metrics cover total, completed, retryable, failed, blocked, review-required,
  attempted, skipped retryable, stale lease, materialized output, failure
  message, and iteration counts.
- Report loading remains backwards-compatible with schema version 1 scheduler
  reports that do not contain `product_metrics`; loaders derive the same metric
  object from the v1 fields after validation.
- Metrics are immutable on loaded report dataclasses and are validated against
  the report state. Forged metric counts, duplicate task/job ID lists, duplicate
  materialized outputs, and multiple failure messages for the same task/job are
  rejected so analytics cannot become a new trust bypass.
- CLI `--print-report` output for production and render scheduler reports now
  includes schema v2 metrics. The default production scheduler summary also
  carries the same product metrics for simple Mac-shell/agent consumption.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so product metrics are treated as implemented infrastructure rather than a
  future target.

Good next test-first targets:

- Consume scheduler report product metrics in workspace-health/workspace-index
  summaries or a future Mac UI state contract without granting metrics any file
  authority.
- Add UI/agent contract tests proving expired production leases, lease conflicts,
  retryable jobs, and metric counts are rendered as review states, not cleanup,
  overwrite, or automatic retry authority.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The assigned branch
  `cursor/branch-reconciliation-and-merge-9549` started at the previous
  `origin/main` and now contains this run's metrics work.
- The only remote branch still not merged into the final tree is
  `origin/cursor/branch-consolidation-strategy-71a5`. It is rejected as
  superseded: `git diff HEAD..origin/cursor/branch-consolidation-strategy-71a5`
  would remove the scheduler metrics implementation, tests, and docs while only
  adding older consolidation merge commits.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after confirming it was
  already merged.
- Fast-forwarded local `main` to the verified assigned branch and pushed
  `origin/main`; `origin/main` and the assigned branch now compare `0 0` with
  `git rev-list --left-right --count origin/main...HEAD`.
- Final verification before the main push:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 309 tests OK, compileall/diff-check exited 0.

## Implementation continuation note - 2026-05-09 19:00 UTC

This run first reconciled the assigned branch with the latest verified remote
lineage:

- Fetched and pruned remote branches. Most historical cursor branches were
  already removed upstream; the useful active line was
  `origin/cursor/repository-branch-consolidation-4b72`.
- Fast-forwarded `cursor/branch-reconciliation-and-merge-8418` from the
  production-scheduler-report baseline (`0f169fd`) to `0e1c4a9`, bringing in
  production-status/workspace-health/index visibility, stale production lease
  recovery, retryable handoff review gates, and the 18:30 reconciliation notes.
- Pushed the reconciled assigned branch to
  `origin/cursor/branch-reconciliation-and-merge-8418`.

This run then closed the negative-trust coverage gap called out by the previous
handoff:

- Added `workspace_index` regressions proving a corrupt `production_status.json`
  is indexed as an untrusted invalid production artifact, leaves
  `production_scheduler_report` missing/untrusted, routes the derived
  workspace-health next action to `review_invalid_production_status`, and does
  not rewrite the corrupt status file.
- Added `workspace_index` regressions proving a corrupt
  `production_scheduler_report.json` is indexed as an untrusted invalid report,
  routes the derived workspace-health next action to
  `review_invalid_production_scheduler_report`, and does not rewrite the corrupt
  report file.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both pre-render and render progress surfaces have durable report
  artifacts and review-required states.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving Mac shells treat expired production leases
  and production lease conflicts as review states, not cleanup, overwrite, or
  automatic retry authority.

Branch reconciliation for this run:

- `origin/cursor/repository-branch-consolidation-4b72` is fully represented by
  the assigned branch after the fast-forward and this run's follow-up commit.
- `origin/cursor/repository-branch-consolidation-4c04` is an ancestor of the
  assigned branch.
- `origin/cursor/branch-consolidation-strategy-d2e7` remains unmerged because it
  is a superseded consolidation tip. Comparing it against the assigned branch
  shows it would remove the newer production lease recovery, retryable handoff
  review gates, production scheduler report conflict messages, workspace index
  production-state coverage, and this run's negative trust tests.
- `origin/main` was fast-forwarded from `0f169fd` to the verified assigned
  branch lineage so the consolidated production lease, health/index, retryable
  handoff, and negative trust coverage work is represented on main.
- Final verification on the assigned branch:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch &&
  git branch -r --no-merged HEAD --sort=-committerdate` -> 299 tests OK,
  compileall/diff-check exited 0, the working tree was clean, and the only
  remote branch still not merged into the assigned branch was the superseded
  `origin/cursor/branch-consolidation-strategy-d2e7`.

## Implementation continuation note - 2026-05-09 18:30 UTC

This run first reconciled the previous completed branch work:

- Fast-forwarded the assigned branch `cursor/repository-branch-consolidation-4b72`
  to `origin/cursor/repository-branch-consolidation-4c04`, bringing in
  production scheduler health/index visibility and stale-running production
  lease recovery.
- Pushed the fast-forwarded assigned branch before continuing with new changes.

Then it tightened the UI/agent production handoff contract:

- `plan_next_production_wave_from_status(...)` now treats status-backed
  retryable production jobs as review-required instead of returning them as
  ready work.
- Pending jobs in the same dependency-ready wave can still proceed, but retryable
  jobs must be retried through the scheduler path after explicit operator review
  via `--retryable-job`.
- Added a regression test proving expired-lease style retryable jobs appear in
  `review_required_job_ids` and are not handed back as automatic work.

After reviewer pass, this run also closed adjacent contract gaps:

- `workspace-health` now recommends `run_dry_run_production_scheduler` when a
  trusted production status has pending jobs plus retryable jobs, as long as no
  job is currently running. The scheduler can skip the retryable job while
  advancing pending siblings.
- Added CLI-level coverage proving `next-production-wave --use-production-status`
  omits retryable jobs from `jobs` and surfaces them in
  `review_required_job_ids`.
- Production scheduler reports now preserve stale-lease conflict reasons in
  `failure_messages`, not just `conflicted_lease_job_ids`.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both progress surfaces include status counts, retry/review states,
  and lease events.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and using the stale
  lease expiry path for interrupted jobs.
- Negative trust coverage for invalid production status/report artifacts in
  `index-workspace` was added in the 19:00 UTC run above.

Branch reconciliation for this run:

- `git fetch --prune origin` removed the historical remote cursor branches that
  had already been merged, superseded, or deleted remotely.
- `origin/main` remains at `0f169fd`; the assigned branch contains the prior
  production-health/lease-recovery work plus this handoff contract fix and
  reviewer follow-ups.
- `origin/cursor/repository-branch-consolidation-4c04` is fully represented by
  the assigned branch.
- The only remote branch still not merged into the assigned branch is
  `origin/cursor/branch-consolidation-strategy-d2e7`. Its tree was already
  superseded by the production lease recovery lineage; it is behind the assigned
  branch by six commits and ahead only by its old consolidation merge commit, so
  it was not merged.
- Deleted the stale local branch `cursor/setup-dev-env-3ad0` after confirming it
  was merged into the assigned branch. Local `main` is stale but was left in
  place because cloud branch policy requires development and pushes on the
  assigned branch.
- Final verification on the assigned branch:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 297 tests OK,
  compileall/diff-check exited 0, and the working tree was clean.

## Implementation continuation note - 2026-05-09 18:00 UTC

This run first reconciled the only active remote branch not reachable from
`origin/main`:

- Fast-forwarded the assigned branch `cursor/repository-branch-consolidation-4c04`
  to include `origin/cursor/branch-reconciliation-and-merge-2e3f`, bringing in
  production-status and production-scheduler visibility inside
  `workspace-health` and `workspace-index`.

Then it advanced the next documented reliability target for local production
workers:

- Added stale-running production lease planning in `shootflow.production_worker`.
  `plan_stale_production_leases(...)` validates trusted production status,
  selects only running jobs older than an explicit ISO cutoff, and returns
  retryable status transitions with no-delete/no-cleanup error messages.
- Added guarded stale production lease persistence. `persist_stale_production_leases(...)`
  writes each retryable transition through
  `compare_and_write_production_job_status(...)` using the original running
  `updated_at` as the lease token, so a same-attempt heartbeat refresh becomes a
  conflict instead of being overwritten.
- Integrated the same lease path into `run_dry_run_production_scheduler(...)` and
  the `dry-run-production-scheduler` CLI via `--stale-before` plus
  `--lease-updated-at`.
- Extended `production_scheduler_report.json` and CLI summaries with
  `expired_lease_job_ids` and `conflicted_lease_job_ids`, while preserving the
  rule that expired jobs become retryable review states and are not automatically
  retried unless explicitly allow-listed with `--retryable-job`.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both progress surfaces include status counts, retry/review states, and
  lease events.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and using the new
  lease expiry path for interrupted jobs.
- Add UI/agent contract tests proving Mac shells treat expired production leases
  and lease conflicts as review states, not as cleanup, overwrite, or automatic
  retry authority.

Branch reconciliation for this run:

- `git fetch --prune origin` pruned the prior
  `origin/cursor/branch-reconciliation-and-merge-2e3f` branch after its work had
  already been fast-forwarded into the assigned branch.
- A new remote branch, `origin/cursor/branch-consolidation-strategy-d2e7`,
  appeared during final reconciliation. Its tree matches the already-merged
  production-health commit `74a5b4e` and contains no content beyond that
  consolidation merge; it was not merged because doing so would move the current
  branch away from the newer production lease recovery commits.
- Deleted the local gone branch `cursor/setup-dev-env-3ad0` after confirming it
  was merged into the current branch.
- `origin/main` still points at `0f169fd`. Cloud branch policy for this run
  requires pushing only `cursor/repository-branch-consolidation-4c04`, so this
  run did not push `main`; the assigned branch now contains the consolidated
  production-health work plus the production lease recovery work.
- Final verification after review fixes:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 294 tests OK,
  compileall/diff-check exited 0, and the tree was clean.
- Follow-up correctness and testing reviewers reported no remaining findings
  after the review fixes.

## Implementation continuation note - 2026-05-09 17:30 UTC

This run advanced the production-health visibility gap identified by the 17:00
handoff:

- `workspace-health` now derives the trusted production plan from
  `ingest_manifest.json`, validates `production_status.json` and the optional
  `production_scheduler_report.json`, exposes production plan/job counts and
  pending/running/succeeded/failed/retryable counts, and recommends
  `init-production-status`, `dry-run-production-scheduler`, or explicit
  production review states before falling through to render handoffs.
- `workspace-health` remains read-only: it does not create production status,
  run schedulers, repair stale reports, reset progress, overwrite outputs, or
  delete media. Invalid production status/report artifacts fail closed into
  review actions.
- `index-workspace` now carries `production_status` and
  `production_scheduler_report` artifacts, plus the health-derived production
  counts and next action, so native shells and continuation agents can render
  pre-render progress without parsing raw manifests directly.
- The workspace-health schema version is now `3` because its JSON includes
  production fields and production artifacts.

Good next test-first targets:

- Add stale-running production lease planning/persistence, mirroring render stale
  lease contracts before allowing concurrent local production workers.
- Begin a real local proxy/VLM/metadata worker adapter behind the existing
  production-worker action contract, preserving declared-output-only authority.
- Add product metric emission at scheduler/report boundaries now that both
  production and render progress are surfaced through health/index.

Branch reconciliation for this run:

- The assigned branch started equal to `origin/main` at `0f169fd`, and the
  current work is the only new branch delta:
  `67e903b feat(workspace): surface production scheduler health`,
  `4a59a5e docs: record production health reconciliation`, and
  `3d7590f test(workspace): cover invalid production status health`.
- Historical remote branches remain visible, but previous reconciliation passes
  already merged the useful storage, demo, production, render, health, and index
  work into `origin/main`. This run did not identify a newer remote branch tip
  that should supersede the current main lineage.
- Final reconciliation after push: `git rev-list --left-right --count
  origin/main...HEAD` returned `0 1`; `git branch --no-merged origin/main` and
  `git branch -r --no-merged origin/main` returned only the assigned branch
  `cursor/branch-reconciliation-and-merge-2e3f`.
- Final verification before push: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src
  python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests
  && git diff --check && git status --short --branch` -> 285 tests OK,
  compileall/diff-check exited 0, and the tree was clean.
- Independent review found one stale design-doc paragraph and suggested adding an
  explicit corrupt production-status regression. Both were addressed in
  `3d7590f`.

## Implementation continuation note - 2026-05-09 17:00 UTC

This run advanced the production-scheduler observability gap identified by the
16:30 handoff:

- Added `production_scheduler_report.json`, a strict durable report for dry-run
  production scheduler runs. The report is bound to the trusted production-plan
  fingerprint and the final `production_status.json`, and records completed,
  retryable, failed, blocked, attempted, skipped retryable, review-required,
  materialized-output, and failure-message details.
- Updated `dry-run-production-scheduler` so it requires `--generated-at`, writes
  the persisted report after loading final status, returns `report_path` in the
  summary payload, and can print the full report with `--print-report`.
- Preserved the explicit retry safety invariant: prior retryable jobs still need
  `--retryable-job`, and report persistence does not grant cleanup, deletion,
  overwrite, or arbitrary output authority.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future sessions treat production scheduler reporting as implemented
  infrastructure.

Good next test-first targets:

- Surface `production_status.json` and `production_scheduler_report.json` through
  workspace-health/workspace-index so Mac shells can show pre-render progress,
  retryable conflicts, blocked jobs, and safe next actions without parsing raw
  manifests directly.
- Add stale-running production lease planning/persistence before allowing
  multiple long-running local production workers.
- Begin a real local proxy/VLM/metadata worker adapter behind the existing
  production-worker action contract, preserving declared-output-only authority.

Branch reconciliation for this run:

- The assigned branch started equal to `origin/main` (`9256751`), and the remote
  tracking branch did not exist when fetched.
- `git rev-list --left-right --count origin/main...HEAD` returned `0 0`;
  `git branch -r --no-merged origin/main` and
  `git branch --no-merged origin/main` returned no unmerged branches.
- No older branch work was merged or rejected in this pass because all visible
  useful remote branch work was already reachable from `origin/main`.

## Implementation continuation note - 2026-05-09 16:30 UTC

This run advanced the production-side scheduler target identified by the 16:00
handoff:

- Added bounded dry-run production batch execution to `shootflow.production_adapter`.
  The batch runner accepts only trusted `ProductionWorkerActionPlan` objects,
  preserves serial jobs, runs parallel-safe jobs under a caller-supplied
  concurrency cap, records stale-action failures without broadening file
  authority, and keeps blocked jobs visible.
- Added `shootflow.production_scheduler`, an iterative pre-render scheduler that
  reloads trusted `production_status.json`, plans dependency-ready
  pending/retryable jobs, runs the dry-run production batch adapter, avoids
  hammering jobs that were already retryable or became retryable earlier in the
  same run, and stops with explicit
  complete/blocked/retryable/failed/waiting/max-iterations state. A prior
  retryable job must be explicitly passed as a reviewed retry candidate before a
  later scheduler invocation will attempt it again.
- Added CLI command `dry-run-production-scheduler --ingest-manifest ... --worker
  dry-run-production-local ...`, giving Mac shells and launch agents a persisted
  status-driven way to advance proxy, analysis, look, grading, storyline, and
  package jobs without reconstructing worker loops in UI code.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future sessions treat production scheduler orchestration as implemented
  infrastructure.

Good next test-first targets:

- Persist a production scheduler report analogous to
  `deliverables/render_scheduler_report.json`, bound to the production-plan
  fingerprint and final `production_status.json`, so UI/index/continuation layers
  can validate pre-render progress without rerunning the scheduler.
- Add workspace-health/workspace-index visibility for production-status and
  production-scheduler state, including retryable/blocked job IDs and safe next
  action recommendations.
- Add stale-running production lease planning/persistence before allowing
  multiple long-running local production workers.

Branch reconciliation for this run:

- The assigned branch started at `origin/main` (`1ae7a63`); its remote tracking
  branch did not exist yet when fetched.
- Older remote branches remain visible, but previous reconciliation notes already
  identify them as stale/older-lineage or already incorporated into current
  `origin/main`. This run's useful work is the new production scheduler line and
  should be merged once tests and branch policy checks pass.

## Implementation continuation note - 2026-05-09 16:00 UTC

This run advanced the pre-render production execution proof point that the
previous run identified:

- Added `shootflow.production_adapter` with a deterministic
  `dry-run-production-local` adapter.
- `run_dry_run_production_action(...)` now consumes only a trusted
  `ProductionWorkerAction`, rebinds it to the trusted `ProductionPlan`, reloads
  `production_status.json`, persists a running claim with
  `compare_and_write_production_job_status(...)`, materializes deterministic
  placeholder bytes only to the action's declared file output paths, and persists
  either success checksums or a retryable no-delete error through the same
  guarded compare/write boundary.
- The adapter refuses stale claims before output materialization and preserves
  directory-style package outputs or existing different output files by reporting
  retryable status rather than overwriting or cleaning up media.
- Updated README, product strategy, business plan, and design decisions so future
  sessions treat the dry-run production adapter as implemented infrastructure.

Good next test-first targets:

- Add a bounded production batch/scheduler wrapper that reloads trusted
  `production_status.json`, plans dependency-ready actions with
  `plan_production_worker_actions(...)`, executes `dry-run-production-local`, and
  stops with explicit complete/blocked/retryable/failed/waiting state.
- Add stale-running production lease planning/persistence, mirroring the render
  lease contract before allowing concurrent local production workers.
- Add a CLI command or workspace-health/index extension that surfaces durable
  production-status progress and dry-run production scheduler outcomes to a Mac
  shell without mutating render handoffs.

Branch reconciliation for this run:

- Refreshed `origin/main` before and after implementation. Before merging this
  run's work, the only branch not reachable from `origin/main` was the assigned
  branch `origin/cursor/branch-reconciliation-and-merge-98f9`.
- Reviewed the only new branch diff, addressed independent review findings about
  public materialization bypass and directory-style package outputs, and
  fast-forwarded `main` to include the completed adapter commit.
- Pushed both `origin/cursor/branch-reconciliation-and-merge-98f9` and
  `origin/main` at the same adapter lineage. No older remote branch had new work
  to merge in this pass.

## Implementation continuation note - 2026-05-09 15:30 UTC

This run advanced the pre-render production execution boundary that the previous
run identified as the next test-first target:

- Added `compare_and_write_production_job_status(...)` plus
  `ProductionStatusPreconditionError`, giving `production_status.json` the same
  single-job guarded update shape as render status: local advisory lock,
  validated reload, expected state/attempt check, optional `updated_at` lease
  token, replacement of exactly one status, and no reset of unrelated progress.
- Added `shootflow.production_worker`, a renderer-neutral production worker
  contract for proxy/VLM/color/story/package jobs. It plans dependency-ready
  pending/retryable jobs from a trusted `ProductionPlan` and matching
  `ProductionStatusManifest`, reports blocked jobs with missing dependencies,
  claims one matching action as running, verifies declared output files before
  success, and reports retry/failure states without cleanup or deletion
  authority.
- Updated README, product strategy, business plan, and design decisions so future
  runs treat production-worker transitions as implemented infrastructure rather
  than an unresolved handoff gap.

Branch reconciliation for this run:

- Refreshed `origin/main` before and after implementation. Before this run's new
  commit, `git branch -r --no-merged origin/main` and
  `git branch --no-merged origin/main` returned no pre-existing feature branches
  with work stranded outside main.
- No older branch work was merged or rejected in this pass because the useful
  branch work from previous runs was already reachable from `origin/main`.
- This run's new production-worker work is intentionally left on the assigned
  branch for the automation PR flow. Cloud branch policy for this session says to
  push only `cursor/repository-branch-consolidation-d65c`, so do not manually
  push `main` from this checkout unless a later explicit instruction supersedes
  that policy.

Good next test-first targets:

- Persist production-worker claim/success/retry/failure transitions through a
  small adapter/scheduler wrapper that calls
  `compare_and_write_production_job_status(...)` for each planned action.
- Add stale-running production lease planning/persistence, mirroring the render
  lease contract before allowing concurrent local production workers.
- Add a deterministic dry-run production adapter that materializes placeholder
  proxy/analysis/look/graded/story outputs only at declared paths, then reports
  success through the new worker helpers.

## Implementation continuation note - 2026-05-09 15:00 UTC

Branch reconciliation found the active branch already aligned with
`origin/main`; after `git fetch origin main`, `git branch -r --no-merged
origin/main` returned no remote feature branches with work stranded outside main.
The remaining local `main` ref is still stale/behind, so compare future
reconciliation against `origin/main` unless it is explicitly fast-forwarded.

This run advanced the pre-render production orchestration layer:

- Added `plan_next_production_wave_from_status(...)`, which reloads the verified
  ingest manifest, rebuilds the deterministic production plan, loads trusted
  `production_status.json`, derives completed job IDs from succeeded statuses,
  and returns the next dependency-ready production jobs without writing analysis,
  graded, render-task, status, scheduler-report, or deliverable files.
  Superseded note: as of the 18:30 UTC handoff refinement, status-backed
  handoffs return only pending jobs as ready work; retryable jobs are
  review-required.
- `ProductionWaveHandoff` now carries `status_source`, `active_job_ids`, and
  `review_required_job_ids` so UI/agent consumers can distinguish legacy
  caller-reported progress from durable production status and avoid rescheduling
  running or failed jobs.
- `next-production-wave --use-production-status` exposes the durable status path
  on the CLI and rejects mixing that mode with `--completed-job` arguments.
- Documentation now treats status-backed next-wave planning as the product path
  before future production-worker claim/succeed/retry/fail helpers.

Good next test-first target: add production-worker transition helpers analogous
to the render-worker/status path, so proxy/VLM/grading/story jobs can claim a
pending/retryable production job, persist guarded status updates, verify declared
outputs, and report retry/failure without widening file authority or deleting
source/graded/deliverable media.

## Branch reconciliation note - 2026-05-09 15:00 UTC

This run refreshed remote branch state before implementation. The fetch pruned
older deleted `media-content-automation-*` branches and surfaced 24 remote
feature tips still not reachable from `origin/main`. Blindly merging those tips
would have downgraded the current consolidated core, because most were based on
the older `f30c6ec` lineage and lacked newer `workspace_health`,
`workspace_index`, `render_workspace`, demo-workspace hardening, and CLI
contracts.

Best-work reconciliation decisions:

- Integrated the missing synthetic card-dump-to-render demo workspace from the
  `ai-media-operating-system-c1c0` line onto the current core:
  `create-card-dump-demo-workspace` now builds fake card/SSD volumes, runs the
  real confirmed checksum ingest workflow, writes the resulting
  `ingest_manifest.json`, seeds deterministic trusted render-task demo inputs,
  and leaves render-status/scheduler report creation to the normal commands.
  A late-arriving consolidation branch added extra hardening that is also
  included here: ISO date validation before writes, synthetic capacity/read-only
  hints for deterministic routing, destination shoot-folder preflight, refusal of
  unexpected destination/source entries, and symlinked workspace-parent
  rejection.
- Added the storage-discovery regression from the native-volume-hints branches:
  hints for paths outside reviewed volume roots are ignored and cannot create a
  source/destination route.
- Integrated the new resumable `production_status.json` manifest from the
  production-status branches. It binds pre-render production job progress to the
  deterministic manifest-backed production-plan fingerprint and exposes
  `init-production-status --ingest-manifest <path>` without creating analysis,
  graded, render, or deliverable files.
- Kept current `macos_volume_metadata`, `storage_discovery`, `card_workflow`,
  `production_handoff`, `render_workspace`, `workspace_health`, and
  `workspace_index` implementations instead of replacing them with older branch
  variants. Those current modules have stricter validation, richer read-only
  summaries, render-input fingerprinting, and stronger safety tests.
- Did not add the older standalone `workspace_state` or parallel
  `render_inspection` modules because their useful read-only state behavior is
  already covered by the current `workspace_health`, `workspace_index`, and
  `render_workspace` surfaces. Future work can revisit "inspect outputs after
  render inputs are archived" as an explicit API change instead of introducing a
  duplicate inspection command.

Final verification after reconciliation:

```bash
git diff --check
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests
git branch -r --no-merged origin/main
git status --short --branch
```

Result: 256 tests passed, compileall and diff-check exited 0, no remote feature
branches remained unmerged into `origin/main`, and the working tree was clean.
Optional `python3 -m ruff check src/ tests/` still reports the two known
pre-existing unused imports in `tests/test_render_worker.py` and
`tests/test_story.py`.

## Branch consolidation note - 2026-05-09 01:00 UTC

The assigned branch `cursor/ai-media-operating-system-9806` started as an
ancestor of the latest verified `origin/cursor/ai-media-operating-system-515f`
lineage, so this run first fast-forwarded to that baseline and pushed it to the
assigned branch.

This run then added render-input provenance to the read-only continuation
surfaces:

- `shootflow.workspace_health.build_workspace_health_summary(...)` now computes
  a deterministic `render_inputs_fingerprint` and `render_input_count` for the
  unique trusted storyline/graded input files referenced by
  `deliverables/render_tasks.json`.
- `python -m shootflow.cli workspace-health --workspace <dir>` exposes those
  fields in its schema-versioned JSON (now schema version 2) without writing,
  repairing, deleting, or advancing any workspace artifact.
- `shootflow.workspace_index.build_workspace_index(...)` carries the same fields
  inside the derived `workspace_health` artifact, so persisted
  `shootflow_workspace_index.json` snapshots can be compared by future agents or
  native shells to notice in-place storyline/graded input changes.
- This is intentionally metadata-only. The trusted render task manifest remains
  the source of path authority, while the fingerprint helps detect drift between
  snapshots before future real renderers trust old status/report context.

## Branch consolidation note - 2026-05-08 23:30 UTC

The assigned branch `cursor/autonomous-media-studio-8ebc` started this cron run
at `origin/main`, so it first merged the already-verified
`origin/cursor/ai-media-operating-system-d72f` lineage and pushed that merge as
`merge: consolidate prior autonomous media studio iteration`.

This run then added a read-only continuation health layer:

- `shootflow.workspace_health.build_workspace_health_summary(...)` validates the
  trusted render-task manifest, matching render-status manifest, and scheduler
  report when present, summarizes render status counts, and returns a single next
  safe action without writing or repairing files.
- `python -m shootflow.cli workspace-health --workspace <dir>` prints the same
  schema-versioned JSON for Mac shells, launch agents, and future autonomous
  runs.
- Invalid handoffs are reported as review actions (`review_invalid_render_*`)
  instead of being overwritten or reset; missing handoffs are treated as normal
  workflow state (`write_render_tasks` / `init_render_status` /
  `run_dry_run_render_scheduler`).
- A post-implementation review found that valid scheduler reports with
  retryable/failed/blocked work should not recommend another scheduler run. The
  follow-up fix now routes any valid non-complete scheduler report to
  `review_scheduler_report`, with regression coverage for a retryable report.

Fresh verification after this change:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
python3 -m compileall -q src tests
git diff --check
```

Final result after the review follow-up: 184 tests passed; compileall and
diff-check exited 0.

## Branch consolidation note - 2026-05-08 23:00 UTC

The assigned branch `cursor/ai-media-operating-system-d72f` started this run at
`origin/main` and did not contain the richer autonomous media-studio work already
verified on `origin/cursor/autonomous-media-studio-3cfb`. This run merged that
branch into the assigned branch with merge commit
`merge: consolidate autonomous media studio work`, then pushed
`cursor/ai-media-operating-system-d72f` to origin.

Fresh post-merge verification on the assigned branch:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

Result: 179 tests passed. Future agents should continue from
`cursor/ai-media-operating-system-d72f` and treat the prior
`cursor/autonomous-media-studio-3cfb` / `cursor/ai-media-operating-system-37cf`
lineage as consolidated into this assigned branch unless new remote commits
appear there.

## Branch consolidation note - 2026-05-08 21:30 UTC

The assigned branch `cursor/autonomous-media-studio-3cfb` was intentionally
advanced from `origin/main` by merging the previously verified sibling branch
`origin/cursor/ai-media-operating-system-37cf`. This brings the native macOS
volume metadata bridge, real-shoot `write-render-tasks` CLI handoff, advisory
CLI `next_actions`, hard-link fallback, documentation, and 179-test regression
suite onto the active automation branch without changing the safety invariants
below. Future agents should continue from this branch rather than reimplementing
that sibling work.

Review follow-up on this branch hardened the render-task handoff after a
multi-agent review pass:

- `shootflow.assembly.ensure_render_tasks_manifest(...)` now reports whether the
  trusted manifest was created or safely reused, while preserving
  `write_render_tasks_manifest(...)` as the existing path-returning wrapper.
- Temporary render-task manifest write failures are wrapped as
  `AssemblyPlanError` and clean up partial `.tmp` files, so transient disk
  failures do not poison later retries with stale temp manifests.
- `write-render-tasks` now uses the single assembly-layer create/reuse policy,
  so concurrent matching manifest creation is reported as `created: false`.
- Empty native macOS metadata recommendation input now returns the same blocked,
  review-required route as "all native records skipped"; the lower-level
  converter still treats an empty candidate conversion call as invalid.
- Added regression coverage for those cases plus preview-only and blocked
  `card-dump-workflow` `next_actions`.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in this iteration

- Added advisory native volume metadata hints for Swift/native shell integration:
  - `shootflow.storage_discovery.VolumeDiscoveryHint` lets a future Swift/Disk
    Arbitration or iPhone shell pass display names, removable status, and
    read-only status keyed by discovered volume path;
  - `discover_storage_candidates(..., volume_hints=...)` applies those hints only
    after a path is discovered under a reviewed volume root and still skips
    symlinks, files, inaccessible entries, and paths without filesystem stats;
  - read-only hints are conservative: `is_read_only=True` can prevent automatic
    destination selection, but `is_read_only=False` cannot override a failed
    filesystem writability check;
  - `discover_import_route(..., volume_hints=...)` carries the same metadata
    into source/destination ranking and capacity-gated route recommendation;
  - `run_card_dump_workflow(..., volume_hints=...)` carries the hint map through
    both the initial route pass and the source-size capacity-gated second pass,
    giving native shells one API for detected-volume metadata through the
    full card-dump workflow.
- Added a native macOS metadata adapter for future Swift/Disk Arbitration
  integration:
  - `shootflow.macos_volume_metadata.MacOSVolumeMetadata` captures typed native
    volume facts: name, mount path, free/total bytes, removable/ejectable/internal
    flags, read-only, network, and system-volume state;
  - `storage_candidates_from_macos_metadata(...)` validates the records, skips
    system volumes, network volumes, missing mounts, file-backed mounts, symlinked
    mount leaves, and symlinked mount parents, then maps usable records into the
    existing `StorageCandidate` ranking contract;
  - ejectable external drives are treated as removable for ranking while internal
    or ejectable detail remains advisory and cannot bypass review;
  - `recommend_import_route_from_macos_metadata(...)` reuses the same
    review-required and capacity-gated route recommendation logic as portable
    discovery, including a clean blocked report when all native records are
    skipped;
  - the adapter remains pure and non-destructive: no copy, delete, eject, format,
    recursive scan, or UI approval authority.
- Added `tests/test_macos_volume_metadata.py` covering native record conversion,
  unsafe record skipping, capacity-gated routing, all-skipped blocked
  recommendations, and validation of metadata/capacity arguments.
- Updated README, product strategy, business plan, design decisions, package
  exports, and continuation notes so the next agent can treat native metadata as
  the bridge between portable `/Volumes` scanning and a future SwiftUI/menu-bar
  approval shell.
- Added a real-shoot persisted assembly CLI handoff:
  - `python -m shootflow.cli write-render-tasks --ingest-manifest <path>` reloads
    the verified ingest manifest, rebuilds the production plan, verifies trusted
    `analysis/instagram_storylines.json` selections plus `graded/` artifacts
    through `shootflow.assembly`, then creates or reuses
    `deliverables/render_tasks.json`;
  - `--photo-set-chunk-size` exposes the existing high-volume chunking contract;
  - an existing different render-task manifest is rejected instead of overwritten;
  - the command writes no deliverable outputs, renders no media, and deletes no
    source files.
- Added tests covering successful render-task handoff creation, refusal to
  replace an existing different handoff, reuse of an existing matching handoff,
  and friendly CLI reporting for invalid ingest-manifest JSON.
- Updated README/product/business/design docs to place `write-render-tasks`
  between trusted storyline/grading work and `init-render-status`.
- Added machine-readable CLI `next_actions` fields:
  - confirmed `card-dump-workflow` reports now point native shells at the trusted
    storyline/graded-artifact preparation step and the exact
    `write-render-tasks --ingest-manifest <path>` handoff;
  - `write-render-tasks` summaries now point at `init-render-status` and
    `dry-run-render-scheduler`, including the trusted non-render dependencies
    each render task needs while still listing scheduler runtime arguments that
    must be supplied by the caller;
  - these fields are advisory orchestration hints only and grant no new copy,
    render, overwrite, delete, or source-media authority.
- Hardened the render-task manifest writer for external/media filesystems that
  do not support hard links: it still prefers the hard-link no-clobber commit,
  but falls back to exclusive final-file creation instead of surfacing an
  uncaught `OSError`.
- Added regression coverage that follows the emitted `write-render-tasks`
  `next_actions` through `init-render-status` and the dry-run scheduler, plus
  coverage for hard-link-unsupported manifest creation.
- Added the first workspace index handoff:
  - `shootflow.workspace_index.build_workspace_index(...)` inspects a shoot
    workspace and summarizes ingest manifests, derived production plans,
    storyline artifacts, render tasks, render status, and scheduler reports;
  - trusted artifacts are loaded through their existing validators, while
    standalone `analysis/instagram_storylines.json` is reported as
    `present_unvalidated` until rebound to a manifest-backed production plan;
  - `write_workspace_index(...)` persists only
    `shootflow_workspace_index.json` through a no-follow temporary metadata file
    and rejects symlinked index paths;
  - `python -m shootflow.cli index-workspace --workspace <dir>
    --generated-at <timestamp> [--write]` prints the same JSON for Mac app
    shells, background agents, and continuation runs.
- Added focused tests for building the index from the persisted CLI demo
  workspace, safe write/load behavior with symlink rejection, and CLI printing
  plus optional persistence.
- Updated README and strategy/design/business/legal docs to position the index
  as a metadata-only continuity artifact, not a new source of render authority.
- This branch then folded the read-only workspace health signal into the index
  as a derived `workspace_health` artifact. `index-workspace` now carries the
  same next safe action as `workspace-health` while remaining metadata-only and
  non-advancing.
- Review follow-up canonicalized workspace roots for persisted indexes, rejects
  missing `workspace-health --workspace` paths instead of emitting misleading
  next actions, and removed new source lint regressions in render-task manifest
  creation.
- Added an explicit renderer-adapter dispatch boundary:
  - `shootflow.render_adapter.supported_render_adapter_names()` now exposes the
    registered local adapters, currently only `dry-run-local`;
  - `shootflow.render_adapter.run_render_adapter_batch(...)` validates a trusted
    `RenderWorkerActionPlan`, refuses unsupported adapter names before any worker
    action is claimed, and then dispatches to the registered batch runner;
  - `shootflow.render_scheduler.run_dry_run_render_scheduler(...)` now validates
    adapter support before stale-lease expiration, status writes, or output
    materialization, so syntactically valid future names such as `ffmpeg-local`
    cannot accidentally run through the dry-run path;
  - the lower-level public dry-run entry points
    `run_dry_run_render_batch(...)`, `run_dry_run_render_action(...)`, and
    `materialize_dry_run_render_outputs(...)` now require `dry-run-local`
    actions/plans, closing the direct-call bypass found during code review.
- Added focused tests for registered dry-run dispatch, unsupported adapter
  rejection without status writes, scheduler-level unsupported adapter rejection,
  and direct dry-run entrypoint guards.
- Added a read-only render workspace inspection handoff:
  - `shootflow.render_workspace.inspect_render_workspace(...)` starts from the
    strict persisted `deliverables/render_tasks.json` manifest, treats a missing
    render-status file as `needs_status_initialization` without writing one, and
    validates matching status/scheduler reports when they exist;
  - `python -m shootflow.cli inspect-render-workspace --workspace <dir>` prints a
    schema-versioned JSON state summary with task counts, expected outputs,
    materialized outputs, review-required task IDs, and safe next actions for a
    Mac UI, launch agent, or continuation agent;
  - stale or conflicting scheduler reports fail closed instead of becoming UI
    truth; symlinked output paths are refused, and succeeded tasks whose
    declared deliverables are missing or whose bytes no longer match their
    recorded SHA-256 checksums are surfaced for render-output review.
- Added CLI tests covering missing-status inspection with no side effects,
  completed demo-workspace inspection after scheduler execution, stale
  scheduler-report rejection, missing succeeded-output review states, and
  checksum-mismatched output review states.
- Added machine-readable agent handoff state to `card-dump-workflow` success
  JSON:
  - each blocked, preview-ready, and ingest-complete response now includes an
    `agent_handoff` object with `next_step`, `human_review_required`,
    `safe_to_rerun`, `next_step_may_copy_bytes`, and `requires_confirm_ingest`;
  - blocked discovery reports `fix_route`, preview-only reports `review_preview`
    and marks the next confirmed step as copy-capable, and completed ingest
    reports `review_production_plan`;
  - this keeps Mac shells, launch agents, and continuation automations from
    parsing prose safety notes to decide whether a human must review or whether
    a next step can move bytes.
- Extended card-dump CLI tests to pin the handoff contract across blocked,
  preview-only, and confirmed-ingest states.
- Branch reconciliation notes for this cron run:
  - remote `main` advanced during the session and already integrated the
    workspace health/index line, adapter-dispatch registry, render-workspace
    inspection, card-dump agent handoff, native `VolumeDiscoveryHint` routing,
    and next-production-wave handoff;
  - the active branch was rebased by merge onto that advanced `origin/main`
    rather than pushing over it;
  - retained the public `create-demo-workspace` CLI handoff from
    `origin/cursor/ai-media-operating-system-255f` because `main` still lacked a
    direct native-shell command for creating the trusted persisted demo workspace;
  - retained strict `--volume-metadata-json` parsing on `plan-import-route` and
    `card-dump-workflow`, mapped onto the current `VolumeDiscoveryHint` contract,
    because it gives Swift/Menu Bar shells one file-based handoff for display
    name, capacity, removable, and read-only facts without granting copy/delete
    authority;
  - added `StorageDiscoveryError` so inconsistent native capacity overrides,
    including partial `free_bytes` overrides that exceed the filesystem total,
    return the normal `shootflow: ...` CLI error path instead of surfacing a raw
    traceback;
  - left older duplicate macOS/metadata/demo/workspace-state branches unmerged
    unless their exact capability is not represented by advanced `main` plus this
    branch's demo and metadata-JSON additions.

## Previous iteration

- Added the first unified card-dump workflow handoff:
  - `shootflow.card_workflow.run_card_dump_workflow(...)` composes mounted-volume
    discovery, source media size estimation, capacity-gated route recommendation,
    checksum ingest preview, optional confirmed copy, and read-only production
    reporting;
  - `python -m shootflow.cli card-dump-workflow` prints one schema-versioned JSON
    report for Mac app shells, launch agents, and GTM demos;
  - without `--confirm-ingest`, it only discovers/estimates/previews and copies
    no bytes; with `--confirm-ingest`, it runs the existing safe ingest boundary
    and then `plan-production` from the manifest;
  - destination subfolders such as `ShootFlow` are constrained to relative paths
    under the selected destination volume, preserving the no-escape/no-delete
    design posture.
- Added CLI tests covering preview-only operation with no destination side
  effects, confirmed ingest plus production reporting without downstream
  analysis/graded/deliverable writes, and blocked no-candidate route behavior.
- Updated README and product/business/design/legal/continuation docs to position
  this command as the next native-shell proof point between drive detection and
  AI/color execution.

## Previous iteration

- Added a read-only post-ingest production-plan handoff:
  - `shootflow.production_report.build_production_plan_report(...)` reloads a
    verified `ingest_manifest.json`, builds the deterministic production plan,
    and returns asset counts, job counts, wave summaries, and planned Instagram
    deliverables;
  - `python -m shootflow.cli plan-production --ingest-manifest <path>` prints
    that report as compact JSON for a Mac app, launch agent, or native-shell
    demo;
  - the command creates no `analysis/`, `graded/`, `deliverables/`, render-task,
    status, or scheduler-report files, so it is safe to run immediately after
    card offload before starting AI/color work.
- Added CLI tests covering a real `execute-ingest --confirm` output feeding the
  new production-plan report, preserving copied WAV/scratch audio in the ingest
  manifest while excluding it from photo/video production assets, and rejecting
  manifests that claim source media was deleted without downstream side effects.
- Updated README, design/product/business/legal docs to describe the new safe
  "what happens next" screen between ingest and production execution.

## Previous iteration

- Added `shootflow.demo_workspace` as a safe persisted CLI smoke/demo helper:
  - `create_persisted_cli_demo_workspace(...)` writes deterministic placeholder
    storyline/graded inputs plus `deliverables/render_tasks.json` for a tiny
    reel, reel variant, carousel, and photo-set package;
  - it refuses symlinked workspace roots, refuses existing different input files,
    and refuses to overwrite an existing different render-task manifest;
  - it deliberately does not create render status, scheduler reports, source
    media, or deliverable outputs so demos still exercise the real
    `init-render-status` and `dry-run-render-scheduler` path.
- Added a CLI smoke test that creates the demo workspace, initializes render
  status, runs the dry-run scheduler with bounded concurrency, reloads the
  persisted scheduler report, and verifies all expected outputs materialize
  through the trusted status/report boundary.
- Updated README/product/business/design docs to treat the demo helper as the
  current proof point for Mac UI shells, launch-agent smoke tests, and GTM demos.

## Previous iteration

- Added safe-ingest CLI commands that finally let a Mac launch agent or human
  operator drive the existing `shootflow.ingest` contracts from the command
  line:
  - `python -m shootflow.cli preview-ingest` wraps `plan_import(...)` and
    prints the planned items, SHA-256 checksums, sizes, and shoot folder as
    indented JSON. It never copies bytes and never writes a manifest, so it
    is safe to run repeatedly during operator review.
  - `python -m shootflow.cli execute-ingest` wraps `plan_import(...)` plus
    `execute_copy_plan(...)`. Without `--confirm` it refuses to run and prints
    a friendly stderr hint pointing at `preview-ingest`. With `--confirm` it
    performs the existing safety contract: no source deletion, no overwriting
    different bytes, SHA-256-verified copies through temp files, and a
    deterministic `ingest_manifest.json`.
- Widened `shootflow.cli.main`'s exception handling to also surface
  `IngestError` and `FileNotFoundError` as `shootflow: <message>` on stderr
  with exit code 1, without changing how the existing render-side or
  import-route commands behave.
- Added five focused CLI tests in a new `ShootFlowIngestCliTests` class:
  preview happy-path, `--confirm` refusal, `--confirm` success with manifest
  verification, symlinked-source rejection without destination side-effects,
  and shoot-slug validation surfacing as a stderr error.
- Updated README to document the `preview-ingest` / `execute-ingest --confirm`
  flow as the operator-facing handoff after `plan-import-route`.

## Previous iteration

- Added source-size estimation to ingest planning:
  - `estimate_import_source(...)` in `shootflow.ingest` reports media file count
    and estimated bytes for a reviewed source path without copying or deleting
    files;
  - this estimate can drive destination capacity checks before import starts.
- Added `python -m shootflow.cli plan-import-route`:
  - scans caller-provided volume roots, emits a review-required source/destination
    route recommendation, and can include discovered candidates in JSON output;
  - supports `--estimate-source-bytes` to estimate payload from the discovered
    source and enforce capacity headroom via the existing capacity-gated routing
    contract;
  - remains advisory-only and non-destructive (no copy, no delete, no format).
- Added CLI and ingest tests covering source-size estimation, successful route
  planning, blocked no-volume behavior, and conflicting capacity-input rejection.
- Updated README, product strategy, business plan, terms draft, and design
  decisions with deeper guidance on offload safety policy, ICP packaging
  strategy, monetization/validation guardrails, and indemnification/liability
  draft language.
- Added safe render-status bootstrapping for persisted render-task handoffs:
  - `initialize_render_status_manifest(...)` in `shootflow.render_status` loads
    an existing fingerprint-matching `deliverables/render_status.json` as-is or
    creates the first all-pending manifest only when the file is missing;
  - initialization holds the existing local advisory lock across the check/create
    path so two Mac launch agents do not both initialize from stale state;
  - stale, malformed, symlinked, or render-plan-mismatched status files are
    rejected instead of overwritten, preserving the no-reset/no-delete safety
    contract.
- Added `python -m shootflow.cli init-render-status`:
  - loads the strict persisted `deliverables/render_tasks.json` manifest as the
    trusted plan;
  - creates or reuses `deliverables/render_status.json`;
  - prints a compact JSON summary with task counts by status for Mac UI,
    background-agent, or smoke-test automation.
- Added tests covering initial creation, idempotent reuse with retryable/running
  progress preserved, stale fingerprint rejection, CLI JSON summaries, and CLI
  stale-status failures.
- Updated README, product strategy, business plan, and design decisions to
  document the two-step persisted-manifest flow:
  `init-render-status` then `dry-run-render-scheduler`.
- Added `shootflow.storage_discovery`:
  - `discover_storage_candidates(...)` validates caller-provided volume roots,
    scans only immediate child directories, skips symlinked/non-directory/inaccessible
    entries, reads filesystem capacity with `statvfs`, and emits conservative
    `StorageCandidate` records for the existing storage ranking layer;
  - `discover_import_route(...)` composes discovery with the existing reviewed
    import-route recommendation, including the high-volume capacity gate when an
    estimated import size is supplied;
  - empty volume roots now produce a blocked, review-required recommendation
    with no-delete/checksum safety notes instead of crashing a future Mac UI.
- Added `tests/test_storage_discovery.py` for mounted-volume discovery, symlink/file
  skipping, argument validation, capacity-gated route composition, and empty-volume
  blocked recommendations.
- Updated README, design/product/business/legal docs, and AGENTS notes to treat
  both render-status bootstrapping and mounted-volume discovery as the current
  Mac app/background-agent handoffs before native macOS Disk Arbitration or
  SwiftUI approval work.

## Previous iteration

- Added high-volume-aware import-route capacity gating in `shootflow.storage`:
  - new `recommend_import_route_with_capacity(...)` takes `expected_import_bytes`
    plus configurable `headroom_bytes`;
  - destination recommendation is blocked when free space is insufficient for the
    estimated import plus safety headroom;
  - recommendation safety notes now include the active capacity gate requirement;
  - preserved non-destructive route semantics (review required, no source deletion
    authority, checksum-manifest reminder).
- Added storage tests for:
  - capacity-gated destination rejection with explicit safety notes;
  - capacity-gated ready route when destination free space is sufficient;
  - capacity-gated argument validation.
- Deepened product docs:
  - `docs/PRODUCT_STRATEGY.md` now includes explicit ICP prioritization,
    Mac-first packaging rationale, monetization shape, and Instagram-led GTM
    framing;
  - `docs/BUSINESS_PLAN.md` added as a dedicated business/monetization/GTM and
    execution artifact;
  - `docs/TERMS_AND_CONDITIONS_DRAFT.md` now includes explicit draft clause
    language for indemnification and non-destructive file handling.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-5b63`, pushed that baseline to
  `cursor/media-content-automation-8119`, then added a reviewed storage import-route recommendation layer.
- Added `ImportRouteRecommendation` and `recommend_import_route(...)` in `shootflow.storage`:
  - validates public candidate arguments before ranking;
  - selects a likely camera-card/source candidate and a distinct automatic writable destination candidate only when
    that destination is still a mounted directory and is not nested inside the selected source tree;
  - returns `ready_for_review` only when both sides exist, otherwise returns `blocked` with missing-source or
    missing-destination safety notes;
  - always marks the recommendation as review-required and includes no-delete, checksum-manifest, and
    backup-verification notes so native UI/agent layers cannot treat drive detection as permission to delete or
    blindly import media.
- Added storage tests for a camera-card-to-SSD route, blocked missing-destination behavior, and invalid candidate
  argument validation, then added regression coverage for stale/unmounted destinations and destinations inside the
  selected source.
- Updated README, product strategy, and design decisions to position this as the Mac ingest-assistant contract
  before actual `shootflow.ingest` copy execution.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-301d`, pushed that baseline to
  `cursor/media-content-automation-5b63`, then added the first persisted-manifest scheduler CLI.
- Added `load_trusted_render_tasks_manifest(...)` in `shootflow.assembly`:
  - loads `deliverables/render_tasks.json` without requiring an already in-memory `AssemblyPlan`;
  - still rejects unknown fields, unsafe inputs/outputs, noncanonical tasks, symlinked manifests, stale temp paths, and
    persisted task inputs that are missing, directories, or symlinks;
  - lets background agents treat the strict persisted render-task handoff as the trusted plan when paired with the
    fingerprint-bound render-status manifest.
- Added `shootflow.cli` with `python -m shootflow.cli dry-run-render-scheduler`:
  - loads the trusted persisted render tasks, runs `run_dry_run_render_scheduler(...)`, reloads final status, writes
    `deliverables/render_scheduler_report.json`, and optionally prints that report JSON;
  - keeps the command as a thin wrapper around existing trusted core APIs instead of adding renderer authority;
  - exposes repeatable `--completed-dependency`, bounded `--max-concurrency`/`--max-iterations`, stale lease arguments,
    and explicit started/completed/generated timestamps for Mac launch agents and automation runners.
- Added CLI tests for successful report writing/printing and unsafe manifest rejection, plus assembly tests for the
  new trusted persisted-manifest loader.
- Updated README, product strategy, and design decisions to mark persisted-manifest CLI scheduling as the current
  Mac UI/background-agent handoff.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-47b6`, pushed that baseline to
  `cursor/media-content-automation-301d`, then added a product-facing scheduler report handoff.
- Added strict scheduler report persistence in `shootflow.render_scheduler`:
  - `write_dry_run_render_scheduler_report(...)` converts a scheduler result plus final trusted
    `RenderStatusManifest` into `deliverables/render_scheduler_report.json`;
  - the report is bound to the trusted `AssemblyPlan` render-plan fingerprint and final status manifest, so it cannot
    invent tasks, outputs, or review-required state;
  - it records completed, retryable, failed, blocked, attempted, skipped-retryable, expired-lease, conflicted-lease,
    review-required, materialized-output, and failure-message details for a Mac UI, retry flow, or next automation run;
  - `load_dry_run_render_scheduler_report(...)` rejects stale fingerprints, unknown task IDs, unknown materialized
    outputs, inconsistent review-required IDs, unknown fields, and malformed failure-message records;
  - report writes use a no-follow temporary file and replace only the metadata report, while renderers still consume
    trusted render tasks/status and receive no new file authority.
- Added scheduler report tests for successful UI summaries, retryable/manual-output conflicts that preserve the existing
  file, and stale fingerprint rejection.
- Updated README, product strategy, and design decisions to describe the scheduler report as the current Mac
  UI/background-agent handoff.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-ccd0`, pushed that baseline to
  `cursor/media-content-automation-47b6`, then added the first iterative dry-run render scheduler.
- Added `shootflow.render_scheduler`:
  - exposes `run_dry_run_render_scheduler(...)` for a local Mac/background-agent style loop that reloads
    trusted render status each pass;
  - optionally plans and persists stale-running leases before scheduling ready work, using the same guarded
    lease persistence path and caller-supplied cutoff/updated timestamps;
  - plans dependency-ready worker actions from the trusted task/status pair and runs them through
    `run_dry_run_render_batch(...)` with bounded concurrency;
  - stops with explicit `complete`, `blocked`, `retryable`, `failed`, `waiting`, or `max_iterations` reasons and returns
    final succeeded/retryable/failed/blocked task IDs for UI/retry decisions;
  - skips tasks already attempted in the same scheduler run if they come back as retryable, so a persistent
    output conflict or manual editor export is preserved for review instead of being hammered repeatedly.
- Added scheduler tests for ready-batch completion, stale lease recovery into a new attempt, and retryable
  output conflicts that are attempted once without overwriting manual files.
- Updated README, product strategy, and design decisions to make the iterative scheduler the current orchestration
  boundary before real renderer backends.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-8ef1`, pushed that baseline to
  `cursor/media-content-automation-ccd0`, then added stale lease persistence.
- Added `persist_stale_render_leases(...)` in `shootflow.render_worker`:
  - consumes a trusted `RenderLeaseExpirationPlan` from `plan_stale_render_leases(...)`;
  - persists each expired lease through `compare_and_write_render_task_status(...)` with
    `expected_state="running"`, the original attempt count, and `expected_updated_at=running_since`;
  - returns persisted lease records with the updated manifest for successful expirations;
  - returns task-level conflict records for compare/write precondition failures so heartbeat-refresh wins are
    surfaced as "another worker already changed this task" instead of being clobbered;
  - keeps conflict messages explicit that no source, graded, or deliverable files were deleted or cleaned up.
- Added render-worker tests for multi-lease persistence and conflict reporting without manifest clobbering.
- Updated README, product strategy, and design decisions to make lease persistence the current safe retry
  boundary for future scheduler loops.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-d522`, pushed that baseline to
  `cursor/media-content-automation-8ef1`, then added the first dry-run batch scheduler.
- Added `run_dry_run_render_batch(...)` in `shootflow.render_adapter`:
  - consumes only a trusted `RenderWorkerActionPlan` produced by the existing render-worker planner;
  - binds every action's task ID, sequence/source/output metadata, inputs, outputs, dependencies, and
    parallelism flag back to the trusted `AssemblyPlan` before any claim or output materialization;
  - executes serial-only actions alone and contiguous parallel-safe action groups through a bounded
    `ThreadPoolExecutor` with caller-provided `max_concurrency`;
  - preserves action-order reporting even when parallel tasks finish out of order;
  - leaves `blocked_tasks` untouched and reports their task IDs for UI/scheduler visibility;
  - catches stale scheduler-level action failures, records explicit no-deletion failure messages, and does
    not materialize outputs for those stale actions;
  - still routes every real claim/result through `run_dry_run_render_action(...)`, which reloads the trusted
    status manifest and uses `compare_and_write_render_task_status(...)` for each task transition.
- Added focused render-adapter tests for successful mixed serial/parallel batches with blocked tasks, stale
  action-plan entries that fail without producing outputs while later ready actions continue, and forged
  action outputs that are rejected before any file is materialized.
- Updated README, product strategy, and design decisions to describe bounded batch execution as the next
  high-volume renderer-scheduler proof point.

## Previous iteration

- Merged the prior `shootflow` foundation onto the active branch.
- Added a strict `deliverables/render_tasks.json` manifest contract in `shootflow.assembly`:
  - writes deterministic, sorted JSON from trusted `AssemblyPlan` render tasks;
  - loads the manifest only when it exactly matches the trusted in-memory assembly plan;
  - rejects unknown manifest/task fields, unsafe analysis/graded inputs, unsafe deliverable outputs,
    symlinked manifest paths, and symlinked temporary manifest paths;
  - gives future render workers a resumable handoff without letting stale or model-authored JSON expand
    the renderer's file access.
- Added `shootflow.assembly` for renderer-neutral social assembly planning:
  - consumes `analysis/instagram_storylines.json` through the trusted storyline loader;
  - accepts only graded outputs from the manifest-backed `ProductionPlan`, never raw originals;
  - verifies selected graded files exist in the workspace before building render tasks;
  - rejects symlinked selected graded assets before a renderer can read through them;
  - enforces that reels use graded video assets and carousels/photo sets use graded photo assets;
  - produces deterministic output paths under `deliverables/` for reel, carousel slides, and photo-set
    JPEGs.
- Added a serialized storyline artifact contract around `StorylinePlan`:
  - writes deterministic JSON to `analysis/instagram_storylines.json`;
  - round-trips reel, carousel, and photo-set sequences with output kind, aspect ratio, asset paths,
    durations, and rationale;
  - rejects storyline artifacts that reference assets outside the trusted loaded analysis/graded
    artifact set;
  - avoids symlinked workspace/artifact paths and writes through a temporary file before replacement.
- Added `shootflow.analysis` for manifest/production-plan-backed VLM analysis loading:
  - loads only planned `analysis/00000.json` style per-asset files;
  - requires analysis to match the planned raw source asset and media type;
  - binds story inputs to graded artifact outputs, not originals;
  - rejects symlinked analysis files, unplanned numbered files, bad schemas, non-finite scores, invalid
    durations, and malformed tags;
  - covers a 10,000-record load path so future storyline planning remains high-volume friendly.
- Added `shootflow.story` for deterministic VLM-driven content selection:
  - validates per-asset analysis paths, media types, scene labels, and scores;
  - builds a first-cut reel from high-scoring video selects with scene diversity;
  - builds a carousel from scene-diverse photo selects;
  - preserves a full ranked photo set so valuable graded intermediates are not dropped.
- Updated production planning so Instagram deliverable assembly depends on a serialized `rank_instagram_storylines` job after scene grouping, look development, and graded-master rendering.
- Expanded product/legal docs around the story-planning layer, indemnification caution, and file deletion safety.

## Earlier render-worker planning iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-cd73` and pushed it to
  `cursor/media-content-automation-33f5`.
- Added deterministic multi-reel storyline variants:
  - `StorylinePlan` now carries named `ReelVariant` records alongside the existing default reel, carousel,
    and photo-set sequences;
  - `build_storyline_plan` emits `hero`, `behind_the_scenes`, and `fast_cut` variants from the same trusted
    VLM analysis records, keeping the default `plan.reel` behavior as the stable first cut;
  - `analysis/instagram_storylines.json` is now schema version 2 with a strict `reel_variants` list, while
    the loader still accepts legacy schema version 1 artifacts with no variants;
  - variant validation uses the same allowlist as primary sequences, so model-authored JSON cannot point a
    reel variant at raw originals or arbitrary files.
- Extended assembly planning for named reel variants:
  - default reels still render to `deliverables/instagram_reel.mp4`;
  - named variants render to collision-free paths such as `deliverables/instagram_reels/fast_cut.mp4`;
  - variant tasks use selected graded video inputs only, depend only on `rank_instagram_storylines` plus
    their selected grade jobs, and can be scheduled independently by future render workers;
  - render task manifest validation now accepts these deterministic variant task IDs/outputs without adding
    new model-controlled fields to the manifest.

## Design decisions to preserve

- Source media deletion remains out of scope.
- Ingest manifests are the boundary between file operations and AI/editing work.
- VLM/story outputs may rank and select content, but must not drive destructive file actions or override
  the manifest-backed production plan.
- Storyline inputs should reference graded artifacts; raw/original paths stay behind the catalog and
  production planning boundary.
- `analysis/instagram_storylines.json` is an edit-decision artifact. Renderers should consume the derived
  `deliverables/render_tasks.json` handoff, not ad hoc model JSON, and should still verify referenced
  graded artifacts before opening media files.
- Assembly tasks are still contracts, not renderers. They should remain deterministic and renderer-neutral
  until the project chooses a local Metal/Core Image, ffmpeg/LUT, DaVinci Resolve, or cloud GPU backend.
- Reel variants are review/export alternatives, not destructive edits. Keep the stable default reel path
  for backwards compatibility and put variants under `deliverables/instagram_reels/`.
- Photo-set chunking is a render-worker scheduling boundary only. It must not change graded artifact names,
  public photo output numbering, storyline ranking, or source-media handling.
- First-cut reel selection intentionally prefers one strong clip per scene before repeated coverage. Future iterations can add alternate reel variants for longer cuts.
- Full photo-set exports stay ranked but not capped; carousel is capped for Instagram.

## What landed in this iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-6863`, pushed that baseline to
  `cursor/media-content-automation-26a1`, then added one focused render-worker lease layer.
- Added `plan_stale_render_leases(...)` in `shootflow.render_worker`:
  - validates the trusted `RenderStatusManifest` against the trusted `AssemblyPlan` before considering
    stale work;
  - requires timezone-aware ISO 8601 `stale_before` and `updated_at` timestamps so timeout decisions are
    explicit scheduler policy rather than implicit worker guesswork;
  - returns `ExpiredRenderLease` records only for `running` statuses older than the cutoff, while skipping
    pending, retryable, succeeded, failed, and fresh running statuses;
  - produces retryable `RenderTaskStatus` transitions that preserve the original renderer adapter and attempt
    count so callers can persist each task through `compare_and_write_render_task_status(...)` with
    `expected_state="running"`, the matching attempt, and `expected_updated_at=running_since`;
  - includes a no-cleanup/no-deletion error message on each retryable status so an expired lease cannot be
    confused with authority to remove source, graded, or deliverable files.
- Tightened `compare_and_write_render_task_status(...)` with an optional `expected_updated_at` precondition so
  timeout-sensitive updates can fail if a same-attempt worker heartbeat refreshed `updated_at` after the
  scheduler planned expiration.
- Expanded render-worker tests for stale lease planning, exact-cutoff handling, invalid timestamp rejection,
  stale status-manifest rejection before timeout planning, and stale lease persistence rejection after a
  same-attempt heartbeat refresh.
- Updated README, product strategy, and design decisions to describe stale-running lease planning as the
  conservative retry boundary for interrupted local workers.

## What landed in the previous iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/-bc-31236baa-8641-4baf-8424-88808ac9e52c-7f37`, pushed that baseline to
  `cursor/media-content-automation-6863`, then added one focused render-status safety layer.
- Added `compare_and_write_render_task_status(...)` in `shootflow.render_status`:
  - holds a local advisory lock file across load, precondition check, replacement, and write so two local
    workers cannot both update from the same stale status snapshot;
  - loads the latest trusted `deliverables/render_status.json` from the workspace before updating;
  - validates the manifest against the supplied trusted `AssemblyPlan`, including shoot slug, task order,
    render-plan fingerprint, state-specific status fields, and assembly-plan path/dependency safety;
  - checks that the target task's current state and attempt count match the worker transition's expected
    precondition before accepting the update;
  - replaces exactly one `RenderTaskStatus` while preserving the manifest shoot slug, render-plan
    fingerprint, and task ordering;
  - validates the updated manifest and writes it through the existing safe status-manifest writer, including
    stale/symlinked temp-path rejection.
- Expanded render-status tests for single-task replacement, stale precondition rejection without rewriting
  the manifest, attempt-only precondition failures, concurrent same-task claims, unknown task IDs, stale
  fingerprints, and safe writer behavior during compare/write updates.
- Updated README, product strategy, and design decisions to describe single-task compare/write updates as
  the current durable boundary between worker transition helpers and future renderer adapters.

## What landed in the previous iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-7fad` and pushed that baseline to
  `cursor/-bc-31236baa-8641-4baf-8424-88808ac9e52c-7f37`.
- Added safe render-worker status transition helpers in `shootflow.render_worker`:
  - `claim_render_worker_action(...)` turns a trusted ready action plus matching current pending/retryable
    status into a `running` status with the selected renderer adapter, attempt number, and timestamp;
  - stale or mismatched claims are rejected if the current status task, state, or attempt count no longer
    matches the worker action;
  - `report_render_worker_success(...)` accepts only a running status matching the same action, verifies
    every declared output exists under `deliverables/`, rejects symlinked output paths, computes streaming
    SHA-256 checksums, and returns a `succeeded` status for exactly those outputs;
  - `report_render_worker_retryable(...)` and `report_render_worker_failure(...)` require a matching
    running status plus a clear error message and preserve the attempt count for retry/failure reporting.
- Expanded render-worker tests around claim, stale claim, success checksum, missing/symlinked outputs,
  mismatched running statuses, and retry/failure paths.
- Updated README, product strategy, and design decisions to document worker status transitions as the next
  contract between the trusted task/status manifests and real renderer adapters.

## Earlier render-worker planning iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-4a21`, pushed it to `cursor/media-content-automation-7fad`, and
  verified the restored baseline.
- Added `shootflow.render_worker` as the dry-run render-worker action contract:
  - validates the supplied `RenderStatusManifest` against the trusted `AssemblyPlan` before scheduling;
  - accepts a trusted set of completed non-render dependency IDs from the future production/job executor;
  - treats dependencies that name render tasks as satisfied only when that render task status is
    `succeeded`;
  - schedules only `pending` and `retryable` tasks whose dependencies are complete;
  - skips `running` tasks so workers are not duplicated before a timeout/lease policy exists;
  - skips `succeeded` and `failed` tasks, leaving failed-task retry decisions explicit;
  - emits `RenderWorkerAction` records with task ID, adapter name, next attempt number, inputs, outputs,
    dependency IDs, aspect ratio, output kind, and parallelism flag;
  - reports `BlockedRenderTask` records with missing dependency IDs for UI/scheduler visibility;
  - keeps actual media opening, rendering, output checksumming, status updates, and temp-output safety out
    of scope for future renderer adapters.
- Added `validate_render_status_manifest(...)` as a public validation wrapper around the existing strict
  status-manifest trust boundary.
- Tightened that trust boundary after review: render status validation now reuses full assembly-plan
  validation so in-memory plans with source-media inputs, unsafe paths, noncanonical outputs, or malformed
  dependencies cannot be fingerprinted or scheduled by the worker.
- Updated README, product strategy, design decisions, and these continuation notes to describe the ready
  action queue between status tracking and real render adapters.

## What landed in this iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-26a1`, pushed that baseline to
  `cursor/media-content-automation-d522`, then added the first safe renderer-adapter orchestration layer.
- Added `shootflow.render_adapter`:
  - `run_dry_run_render_action(...)` loads the latest trusted render status manifest, claims exactly one
    matching `RenderWorkerAction`, persists the claim with `compare_and_write_render_task_status(...)`, writes
    deterministic placeholder outputs, reports success checksums or retryable materialization errors, and
    persists the final status through the same compare/write boundary;
  - `materialize_dry_run_render_outputs(...)` consumes only the trusted action fields and never opens raw,
    source, or graded input files;
  - dry-run outputs are limited to declared `deliverables/` paths, reject unsafe/absolute/parent paths,
    reject symlinked workspaces/output directories/output files/temp files, and refuse to overwrite existing
    different bytes;
  - output commits use a same-directory exclusive temp file plus hard-link creation instead of blind replace,
    so a user/editor export that appears at the target path is preserved rather than overwritten;
  - if output materialization fails after a claim, the adapter persists a retryable status with an explicit
    no-deletion message rather than cleaning up files.
- Added focused tests for dry-run claim/success persistence, existing-output preservation, symlinked-output
  rejection, and stale-claim rejection before output materialization.
- Updated README, product strategy, design decisions, and terms draft notes to describe the dry-run adapter
  as a proof point for future ffmpeg/Core Image/Metal/DaVinci/cloud renderers.

## Suggested next iteration

The worker can now plan ready actions, produce safe per-task status transitions, persist one transition
through a manifest-level compare/write update, identify stale running leases for retry, execute one trusted
action through a deterministic dry-run adapter, execute trusted ready-action batches with bounded local
concurrency, persist planned stale lease expirations with heartbeat-conflict reporting, drive those pieces
through an iterative dry-run scheduler loop, persist a strict UI/agent scheduler report, initialize missing
render-status manifests from persisted render tasks without resetting progress, invoke that handoff from
persisted-manifest CLI commands, and discover mounted-volume candidates for reviewed import routing. The next
useful layer is either richer native macOS volume metadata, a real renderer temp-output contract, stronger
distributed lease persistence, or a small example/smoke fixture for the init-to-report CLI flow.

Good test-first targets:

- Add a native macOS metadata adapter (or a pure testable abstraction for it) that can mark internal disks,
  removable cards, read-only volumes, and external SSDs more accurately than the portable mount-root scanner.
- Add a real `ffmpeg-local` or Core Image/Metal adapter behind
  `run_render_adapter_batch(...)`, including temp-output contracts that replace
  dry-run placeholder bytes while keeping the same no-overwrite/no-delete status
  boundary.
- Add a CLI smoke fixture or example workspace that demonstrates persisted render-task input files, safe
  `init-render-status` bootstrapping, and the printed `render_scheduler_report.json` output a future Mac UI should
  consume.
- If cloud/distributed workers are introduced, add storage-native compare-and-swap or a lease service around
  the same manifest contract; the current advisory lock protects local workers sharing one filesystem.
- Keep real ffmpeg/Core Image/DaVinci rendering out of scope until leases, temp output paths, and adapter
  contracts are safe and well tested.
