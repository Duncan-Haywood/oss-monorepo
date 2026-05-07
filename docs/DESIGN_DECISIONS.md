# ShootFlow Design Decisions

ShootFlow is a personal tool and product concept for photographers and videographers who want more finished social content with less file-management and editing overhead. The first implementation layer is a conservative core engine that can be shared by a future Mac app, iPhone app, background agent, and cloud/GPU workers.

## Product shape

- Start as a desktop-first Mac workflow because large RAW/video shoots, SD cards, and external SSDs are easiest to manage locally.
- Add iPhone capture/review later as a companion: approve selects, review grades, post drafts, and kick off exports.
- Keep local storage and originals as the source of truth. AI may suggest, rank, grade, crop, and assemble, but the system should make provenance and reversibility obvious.
- Treat Instagram Reels, carousels, and feed photos as first-class deliverables, not as a final export checkbox.

## Safety invariants

- Never delete source media during ingest.
- Never overwrite an existing destination file with different bytes.
- Verify copies with SHA-256 before treating an import as complete.
- Write ingest manifests so later editing jobs can reference immutable originals and checksums.
- Reject symlink-based source or destination paths in the core importer. This is intentionally strict because camera-card imports are high-trust, high-value operations.
- Rank detected drives conservatively. Camera-card-like volumes are review-only sources; large writable SSDs can be automatic destination candidates.

## Core architecture

The repo currently contains a Python core package because it is quick to test and can model the critical workflow contracts before native UI work starts.

- `shootflow.ingest`: media discovery, import planning, checksum copy execution, and manifest writing.
- `shootflow.catalog`: manifest loading, path validation, media typing, and the boundary between safe
  imports and production planning.
- `shootflow.analysis`: VLM JSON loading that trusts the production plan instead of arbitrary model
  output paths, validates analysis values, and binds story inputs to graded artifacts.
- `shootflow.storage`: drive/storage candidate ranking for future Mac/iPhone device detection layers.
- `shootflow.deliverables`: parallelizable job planning for graded intermediates and Instagram outputs.
- `shootflow.production`: shoot-level execution planning with proxy, VLM analysis, scene grouping, look
  development, grading, and Instagram packaging waves.
- `shootflow.story`: VLM-score-driven selection planning for first-cut reels, named reel variants,
  carousels, and ranked photo-set exports, plus a deterministic storyline artifact contract for
  downstream assemblers.
- `shootflow.assembly`: a renderer-neutral handoff from trusted storyline selections to explicit social
  render tasks. It verifies selected graded artifacts exist, rejects symlinked selected media, keeps raw
  originals out of render inputs, derives deterministic output paths under `deliverables/`, chunks large
  ranked photo-set exports into parallel resumable tasks, creates collision-free tasks for named reel
  variants, and persists strict render manifests for future workers.
- `shootflow.render_status`: a render-worker progress contract that persists status keyed by trusted
  render task IDs and a canonical render-plan fingerprint. It records
  pending/running/succeeded/failed/retryable states, renderer adapter names, attempts, error messages,
  output checksums, and timestamps without accepting source-media paths, arbitrary task IDs, or deletion
  instructions. Its compare/write update helper takes a local advisory lock, reloads the latest manifest,
  checks the expected prior state, attempt, and optional `updated_at` lease token for one task, replaces only
  that status, and writes back through the same safe manifest writer.
- `shootflow.render_worker`: a dry-run worker action planner that consumes trusted `AssemblyPlan` and
  `RenderStatusManifest` records, validates the status fingerprint, schedules only dependency-ready
  pending/retryable tasks, reports blocked tasks, claims ready tasks as running, and lets adapters report
  success/retry/failure without widening file access. It keeps running tasks out of duplicate scheduling
  until a caller explicitly plans stale lease expiration; that lease plan only returns retryable status
  transitions and never authorizes file cleanup or deletion. Its persistence helper applies those expired
  leases through the same single-task compare/write status boundary, using the original `running_since`
  timestamp as the lease token so same-attempt worker heartbeats surface as conflicts instead of being
  overwritten.
- `shootflow.render_adapter`: the first adapter-orchestration layer. Its deterministic dry-run adapter
  consumes a single trusted `RenderWorkerAction`, persists a claim through `compare_and_write_render_task_status(...)`,
  materializes only the action's declared `deliverables/` outputs as non-overwriting placeholder files, reports
  success checksums or retryable errors, and persists the final status through the same compare/write boundary.
  It also includes a dry-run batch scheduler for a trusted `RenderWorkerActionPlan`: serial-only actions run
  alone, parallel-safe actions run in ordered groups up to a caller-provided concurrency limit, blocked tasks
  remain visible and untouched, action fields are rebound to the trusted `AssemblyPlan` before any output is
  materialized, and stale scheduler-level action failures are reported without materializing outputs. It
  intentionally does not open source or graded inputs, delete files, or implement real media rendering.
- `shootflow.render_scheduler`: a local dry-run orchestration loop above the adapter boundary. It reloads the
  trusted status manifest on every pass, optionally plans and persists stale-running lease expirations through the
  guarded lease helper, plans dependency-ready actions, runs bounded dry-run batches, and stops with explicit
  `complete`, `blocked`, `retryable`, `failed`, `waiting`, or `max_iterations` reasons. It deliberately skips any task it
  already attempted when that task becomes retryable in the same run, so a stuck output or manual editor export is
  preserved for review instead of being hammered repeatedly. It can persist a strict
  `deliverables/render_scheduler_report.json` summary bound to the trusted render-plan fingerprint and final status
  manifest, giving Mac UI, retry flows, and continuation agents an actionable view of completed, retryable, failed,
  blocked, review-required, materialized-output, lease-conflict, and failure-message details.
- `shootflow.cli`: the first background-agent command surface. The dry-run scheduler command loads the persisted
  `deliverables/render_tasks.json` handoff through the same strict task schema/path validation, treats that loaded
  plan as the trusted renderer contract, validates the matching render-status manifest by fingerprint, runs the
  scheduler, writes `deliverables/render_scheduler_report.json`, and optionally prints the report JSON for a Mac UI,
  launch agent, or continuation automation. It does not accept model-authored paths, delete files, or widen renderer
  authority beyond the persisted render-task/status contracts.

Future native applications should wrap these contracts rather than reimplementing the safety rules in UI code.

## AI/color pipeline direction

The desired high-quality pipeline is:

1. Ingest originals to a dated shoot folder.
2. Generate proxies and technical metadata in parallel.
3. Run content understanding: scene grouping, face/object/context tags, sharpness, exposure, motion, audio energy, and duplicate detection.
4. Build look references from user presets, past shoots, brand mood boards, or a hero frame.
5. Generate non-destructive color decisions per scene/set, not isolated per asset.
6. Rank storylines from VLM outputs so first-cut reels and carousels have narrative and scene variety.
7. Export graded intermediates for all selects.
8. Plan assembly tasks from trusted graded selections before invoking any renderer.
9. Track render-worker progress through a resumable status manifest keyed by the trusted task plan.
10. Plan renderer-neutral worker actions from the trusted task/status pair.
11. Claim ready render actions as running, then report success/retry/failure statuses with checksums for
    declared deliverable outputs only.
12. Persist each worker transition through a single-task compare/write helper so stale workers cannot
    overwrite newer claims or results.
13. Plan stale running leases from trusted status plus an explicit cutoff, then persist each retryable
    transition through the same single-task compare/write boundary.
14. Run adapter orchestration against a dry-run renderer that proves claim/result persistence and output-safety
    rules before wiring in real ffmpeg, Core Image/Metal, DaVinci Resolve, or cloud GPU rendering.
15. Run trusted ready-action batches with bounded local concurrency so high-volume photo-set chunks can make
    progress while serial reels and blocked tasks stay deterministic and inspectable.
16. Drive the dry-run renderer with an iterative scheduler loop that alternates trusted status reloads, stale lease
    expiration, ready-action planning, bounded batch execution, and explicit stop summaries for UI/retry decisions.
17. Persist a scheduler report after each run so UI/retry/continuation layers can tell the user which deliverables
    finished, which tasks need review, which outputs were materialized, and which failures or lease conflicts require
    attention.
18. Run the persisted-manifest scheduler through a CLI/background-agent command so native app work can begin from
    durable handoffs rather than an in-process Python object graph.
19. Assemble deliverables: reels, carousels, photo sets, story crops, thumbnails, captions, and suggested posting packages.
20. Iterate using reviewer feedback: "warmer skin," "more cinematic contrast," "use more behind-the-scenes," "make it faster."

High quality depends on scene-level consistency and reversible edits. The system should produce edit decision data first, then render from masters.

## Parallelism model

- Per-asset analysis and initial grading jobs are embarrassingly parallel.
- Scene clustering, look normalization, and deliverable assembly depend on per-asset outputs.
- Reels should assemble from proxy timelines, then conform from graded masters.
- The job graph should be deterministic and resumable so 10,000+ asset shoots can recover from interruption without starting over.
- The production planner uses explicit execution waves:
  1. proxy every asset;
  2. run per-asset VLM/content analysis;
  3. group scenes and narrative sets;
  4. derive a shoot-level look;
  5. render per-asset graded masters in parallel;
  6. rank IG storylines from analysis, scene, and look data;
  7. assemble social packages from the graded masters.
- This structure keeps expensive per-asset work highly parallel while preserving quality-critical global
  decisions, especially scene consistency and look development.

## Production planning notes

- Job IDs are deterministic for a fixed manifest order so later workers can cache, retry, and resume
  individual assets within a planned shoot. A future manifest-backed ID should incorporate relative path
  and checksum when the ingest manifest becomes the canonical production input.
- Ingest manifests are the handoff contract from file operations to AI/editing work. Catalog loading
  validates that manifest destinations stay under the import root, rejects destructive-source manifests,
  rechecks destination size/checksum, and ignores non-photo/video assets for production planning while
  preserving them in the original ingest manifest.
- VLM analysis files are not trusted just because they exist. `shootflow.analysis` loads only the
  `analysis/00000.json` style files declared by the production plan, requires each file to name the
  planned source asset, rejects unplanned numbered analysis files, validates scores/durations/tags, and
  emits `AssetAnalysis` records that point at graded artifacts rather than originals.
- Jobs expose explicit output artifacts. Instagram deliverables consume graded-master artifacts, not raw
  originals, which keeps social assembly downstream of the color pipeline.
- Per-asset proxy and graded artifacts are namespaced by job ID so common camera filenames such as
  `IMG_0001.CR3` do not collide across cards or archive folders.
- Deliverables depend on matching graded masters, not raw originals. Reels only depend on video grades;
  carousels and photo sets only depend on photo grades.
- `shootflow.story` currently chooses a first-cut reel from the best clip per scene, then adds named
  `hero`, `behind_the_scenes`, and `fast_cut` reel variants for reviewable social narratives. Carousels
  come from diversified photo selects, and photo sets come from every graded photo ranked by quality.
  This keeps the automatic output useful while still preserving all graded intermediates for human/editor
  review.
- Storyline selection persists to `analysis/instagram_storylines.json` as an edit-decision contract
  with reel, reel-variant, carousel, and photo-set sequences. The reader rejects references outside the
  trusted graded artifact set so model-authored JSON cannot smuggle arbitrary files into a renderer.
- Assembly planning consumes that storyline artifact and rechecks selected graded files on disk before
  producing render tasks. Reel tasks use selected graded videos only; carousel and photo-set tasks use
  selected graded photos only. Outputs are deterministic (`deliverables/instagram_reel.mp4`,
  named reel variants under `deliverables/instagram_reels/`, ordered carousel slides, and ordered
  photo-set JPEGs) so retries and UI review do not reshuffle the package.
- `deliverables/render_tasks.json` is the render-worker handoff. The loader requires exact JSON fields,
  safe analysis/graded inputs, deliverables-only outputs, no symlinked manifest/temp paths, no duplicate
  output targets, and an exact match with the trusted in-memory `AssemblyPlan` before a renderer may
  consume it.
- Large `photo_set` sequences are split into deterministic chunk tasks such as
  `export_instagram_photo_set_part_00001` while preserving public output names like
  `deliverables/instagram_photo_set/photo_00001.jpg`. This lets 10,000-photo exports retry and parallelize
  at chunk granularity without changing the user-visible package structure.
- The current planner is intentionally an edit-decision contract, not a renderer. Future renderers can be
  local Metal/Core Image, ffmpeg/LUT, DaVinci Resolve automation, or cloud GPU workers as long as they
  honor the same job IDs and dependencies.
- Renderer adapters should accept only trusted `RenderTask` records, verify each input still exists before
  opening it, write outputs through temporary files before atomic replacement, and report per-task status
  without deleting source or graded media. A Core Image/Metal adapter, ffmpeg adapter, DaVinci Resolve
  automation adapter, or cloud GPU adapter should all be swappable behind that contract.
- `deliverables/render_status.json` is the companion worker-progress handoff. The loader requires exact
  JSON fields, the same shoot slug, task ordering, and render-plan fingerprint as the trusted
  `AssemblyPlan`, known status states, state-appropriate attempts/error/checksum fields, symlink-safe
  manifest paths, and checksums only for each task's expected deliverable outputs. Status writes use
  exclusive no-follow temporary file creation and reject stale canonical temp files. Status validation
  reuses full assembly-plan validation before fingerprinting so in-memory callers cannot bypass the
  render-task manifest's path/dependency rules. Status files cannot introduce source paths, new tasks,
  stale task contents, or destructive operations. Workers should persist status transitions through
  `compare_and_write_render_task_status(...)`, which holds a local advisory lock across reload,
  precondition check, replacement, and write. The helper verifies the task's current state and attempt still
  match the transition precondition, can also require the current `updated_at` value to match an
  `expected_updated_at` lease token, replaces exactly one status, preserves task order/fingerprint/slug, and
  writes through the safe manifest writer. This protects same-workspace local workers from last-writer-wins
  status clobbering and lets stale lease expiration fail if a same-attempt heartbeat refreshed the task after
  planning; distributed/cloud workers still need an external lease or storage-native compare-and-swap around
  the same contract.
- `shootflow.render_worker` is the next handoff after status validation, not a renderer. It accepts a
  caller-provided set of completed non-render dependency IDs from the trusted production/job executor,
  treats render-task dependencies as satisfied only by succeeded render statuses, plans attempts for
  pending/retryable tasks, and returns blocked-task reasons for UI or scheduler visibility. It also exposes
  explicit status-transition helpers: a worker can claim a pending/retryable action only when the current
  status and attempt number match, report success only after every declared deliverable output exists and
  has a SHA-256 checksum, or report retry/failure with a clear error message. It intentionally leaves real
  media opening, output temp-file strategy, output cleanup, and cross-process file locking to future
  renderer adapters. `plan_stale_render_leases(...)` is the conservative timeout boundary: callers provide a
  timezone-aware cutoff and the helper returns retryable transitions for running statuses whose `updated_at`
  is older than that cutoff. It skips fresh running work, validates the trusted status manifest first, and
  includes an explicit no-cleanup/no-deletion error message so a timeout cannot be confused with authority
  to remove source, graded, or deliverable files. Persist each expiration with `expected_state="running"`,
  the lease's attempt number, and `expected_updated_at=running_since` so a refreshed same-attempt lease cannot
  be expired by a stale scheduler snapshot. `persist_stale_render_leases(...)` now packages that persistence
  pattern for schedulers: successfully expired tasks become retryable, while compare/write precondition
  failures are returned as task-level conflicts that explicitly say another worker already changed the task
  and no source, graded, or deliverable files were deleted.
- `shootflow.render_adapter` now exercises the adapter handoff without real media rendering. The dry-run
  adapter loads the latest trusted status manifest, claims a matching pending/retryable action, writes
  deterministic placeholder outputs only for declared deliverable paths, refuses symlinked outputs, refuses
  to overwrite any existing file with different bytes, and then reports success checksums or retryable
  materialization errors. It uses hard-link commit from a same-directory temp file instead of blind replace
  so a user/editor export that appears at the target path is preserved. This is the safety shape future
  high-quality renderers should keep while replacing placeholder bytes with real media output. Its batch
  helper executes only a prevalidated `RenderWorkerActionPlan`, respects each action's `can_run_in_parallel`
  flag, caps parallel groups with `max_concurrency`, surfaces blocked task IDs, verifies action fields against
  the trusted render tasks, and records stale-action failures with an explicit no-deletion message instead of
  treating them as render results.
- `shootflow.render_scheduler` is the first end-to-end local scheduler shape for the future Mac app. It runs the
  trusted dry-run render loop until no immediately runnable work remains, including stale-running lease recovery
  when the caller supplies an explicit cutoff. It reports final succeeded/retryable/failed/blocked task IDs and
  a stop reason instead of hiding unfinished work. Retryable tasks attempted during the same scheduler run are not
  retried again in a tight loop, preserving manual exports and unsafe output conflicts for user/editor review.
  `write_dry_run_render_scheduler_report(...)` turns the in-memory result plus the final trusted status manifest into
  `deliverables/render_scheduler_report.json`, and the loader rejects stale fingerprints, unknown task IDs, output paths
  not present in succeeded status checksums, and inconsistent review-required task lists. This report is product-facing
  state, not a renderer authority: renderers still consume trusted render tasks and status manifests.
- VLM output should feed structured scene, subject, quality, and narrative metadata. It should not make
  destructive storage decisions.

## Business viability notes

Primary buyers:

- Photographers and videographers who need more Instagram output but want time back from culling, editing, and file management.
- Small studios already paying editors who want faster turnaround, better consistency, and more content per dollar.
- Creators with large archives who want old footage turned into new reels and carousels.

Useful wedges:

- "Dump a card, get organized imports and draft IG packs."
- "Turn a wedding/editorial/event shoot into 3 reels, 2 carousels, and graded selects overnight."
- "Consistent look across photo and video without managing files by hand."
- "Know exactly what is ready, rendering, blocked, or safe to retry in a 10,000-asset shoot."
- "Hand an editor or renderer a deterministic task list, progress file, and ready-action queue instead of
  a vague drive full of media."
- "Let local or cloud workers claim and report render tasks without ever receiving authority to delete
  originals or invent output paths."
- "Reject stale local worker results at the manifest boundary when another worker has already claimed,
  retried, or completed the same task."
- "Prove renderer orchestration with a dry-run adapter before customers trust it with irreplaceable shoots or
  editor-produced deliverables."
- "Safely chew through ready render-action batches on local hardware while keeping blocked, stale, and
  interrupted work visible instead of hidden inside an opaque export queue."
- "Recover interrupted local render work by expiring stale leases through the same guarded status update path,
  while preserving heartbeat-refresh wins from active workers."

Avoid competing only on generic AI editing. The differentiator is end-to-end workflow: ingest safety, organization, grade consistency, social packaging, and iteration.

## Open decisions for future iterations

- Native stack: Swift/SwiftUI plus a Python/Rust worker, or a Tauri/Electron shell with native media extensions.
- Color engine: LUT/CDL/ACES-style decision layer, Core Image/Metal renderer, DaVinci Resolve integration, or hybrid.
- VLM providers: local model support for privacy vs. hosted APIs for quality and throughput.
- Sync model between Mac and iPhone.
- Pricing: one-time pro tool, subscription, or usage-based render credits.
