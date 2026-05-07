# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in this iteration

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
concurrency, and persist planned stale lease expirations with heartbeat-conflict reporting. The next useful
layer is either an iterative dry-run scheduler loop, real renderer temp-output contracts, or stronger
distributed lease persistence.

Good test-first targets:

- Add an iterative dry-run scheduler loop that alternates: load trusted status, plan stale lease expirations,
  persist safe expirations, plan ready actions, run a bounded dry-run batch, then stop when no actions or
  expirations remain. This would model the Mac background worker loop without opening real media.
- Add real renderer temp-output contracts that replace dry-run placeholder bytes with ffmpeg/Core Image/Metal
  outputs while keeping the same no-overwrite/no-delete status boundary.
- If cloud/distributed workers are introduced, add storage-native compare-and-swap or a lease service around
  the same manifest contract; the current advisory lock protects local workers sharing one filesystem.
- Keep real ffmpeg/Core Image/DaVinci rendering out of scope until leases, temp output paths, and adapter
  contracts are safe and well tested.
