# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

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
  and returns the next dependency-ready pending/retryable production jobs without
  writing analysis, graded, render-task, status, scheduler-report, or deliverable
  files.
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
