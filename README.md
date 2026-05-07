# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram reels, carousels, and graded
intermediates without spending their lives on file wrangling.

The product direction is:

- ingest SD cards, local folders, SSDs, RAW/JPEG/log/video footage safely;
- never delete source media during ingest;
- copy with checksums, manifests, and conflict detection;
- build highly parallelizable color-grading and deliverable jobs;
- produce cinematic reels, carousels, feed photo sets, and intermediate graded
  masters for human review or editor handoff.

## Current repository state

This repo currently contains the first testable core utilities:

- `shootflow.ingest` plans and executes safe media copies.
- `shootflow.catalog` loads ingest manifests into a photo/video catalog for
  downstream production planning.
- `shootflow.analysis` loads per-asset VLM JSON outputs only when they match a
  trusted production plan, then binds them to graded artifact paths for story
  selection.
- `shootflow.assembly` consumes trusted storyline selections and produces
  explicit render tasks from verified graded assets, without performing media
  rendering or destructive file operations. It can persist those tasks to a
  strict `deliverables/render_tasks.json` manifest for future render workers,
  including chunked photo-set export tasks for high-volume shoots.
- `shootflow.render_status` persists a strict `deliverables/render_status.json`
  manifest keyed by trusted render task IDs so workers can resume, retry, and
  report progress without adding source-media paths or delete instructions.
  Status files are bound to a render-plan fingerprint so stale progress cannot
  be reused after storyline selections or render inputs change. Manifest-level
  compare/write helpers take a local advisory lock, update exactly one task
  status, and check the expected prior state, attempt, and optional timestamp
  lease token.
- `shootflow.render_worker` turns trusted render tasks plus trusted status into
  dry-run worker actions. It schedules only dependency-ready pending/retryable
  tasks, reports blocked tasks, skips running/succeeded/failed tasks, claims
  ready work as running, and reports success/retry/failure statuses with
  checksums for declared deliverable outputs only. It can also plan explicit
  stale-running lease expirations as retryable status transitions and persist
  those expirations through the same compare/write boundary without granting
  cleanup or deletion authority.
- `shootflow.render_adapter` adds the first renderer-adapter boundary: a
  deterministic dry-run adapter that claims one trusted worker action, writes
  only its declared `deliverables/` outputs through non-overwriting placeholder
  files, reports checksums, and persists both claim and result through the
  single-task compare/write status path. It can also execute a trusted dry-run
  action plan in batches, running parallel-safe ready actions up to a caller
  supplied concurrency limit while preserving serial-only actions and leaving
  blocked tasks untouched for UI/scheduler visibility.
- `shootflow.render_scheduler` ties the dry-run render pieces into an iterative
  local orchestration loop: it reloads trusted status each pass, optionally
  persists stale lease expirations, plans dependency-ready actions, runs bounded
  dry-run batches, avoids hammering retryable tasks within the same run, and
  returns a compact completion/blocked/retryable/failed summary for a future Mac app.
  It can also persist `deliverables/render_scheduler_report.json`, a strict
  UI/agent handoff that records completed, retryable, failed, blocked,
  review-required, materialized-output, lease-conflict, and failure-message
  details without granting any new file authority.
- `shootflow.cli` exposes the first background-agent command:
  `python -m shootflow.cli dry-run-render-scheduler`. It loads the strict
  persisted render-task manifest as the trusted plan, runs the dry-run scheduler
  against the matching render-status manifest, writes the scheduler report, and
  can print that report as JSON for a Mac app or automation runner.
- `shootflow.storage` ranks possible source and destination drives
  conservatively, then can recommend a review-required import route from a
  likely camera card/source to a writable SSD/local destination without granting
  deletion or blind-import authority.
- `shootflow.deliverables` builds initial Instagram deliverable job plans.
- `shootflow.story` turns VLM analysis scores into ranked first-cut reel,
  carousel, photo-set, and named reel-variant recommendations, then persists
  the selections as a deterministic `analysis/instagram_storylines.json`
  edit-decision artifact.
- `shootflow.production` expands a shoot into deterministic proxy, VLM
  analysis, look-development, grading, storyline selection, and Instagram
  packaging waves.

The intended first workflow is:

1. Detect/rank attached cards, folders, and SSDs, then present a reviewed
   source-to-destination import route with explicit no-delete/checksum notes.
2. Plan and execute a safe import from the approved card, folder, or SSD.
3. Keep the generated `ingest_manifest.json` as the boundary between file
   management and AI/editing work.
4. Load the manifest with `shootflow.catalog`, which rechecks manifest
   location, destination paths, file sizes, and checksums before production.
5. Build production waves from manifest-backed photo/video assets so proxies,
   VLM analysis, color decisions, graded masters, storyline choices, and
   Instagram packages all trace back to verified originals.
6. Load VLM results with `shootflow.analysis` so social planning consumes graded
   artifact paths and rejects analysis that does not match the planned source
   assets.
7. Persist `shootflow.story` selections as a trusted storyline artifact for
   downstream reel, reel-variant, carousel, and photo-set assemblers.
8. Build `shootflow.assembly` render tasks that verify selected graded files
   exist, keep raw originals out of social assembly inputs, and write
   deterministic `deliverables/` targets for future renderers. Large ranked
   photo sets are split into resumable chunks while preserving stable public
   output names like `photo_00001.jpg`; named reel variants render under
   `deliverables/instagram_reels/` without replacing the default reel handoff.
9. Persist and reload `deliverables/render_tasks.json` against the trusted
   assembly plan so parallel render workers cannot consume model-authored or
   stale task JSON.
10. Persist and reload `deliverables/render_status.json` against the same trusted
   render tasks so a Mac app, local renderer, or cloud worker can show pending,
   running, succeeded, failed, and retryable work safely.
11. Derive renderer-neutral worker actions from the trusted task/status pair
    before any ffmpeg/Core Image/DaVinci/cloud adapter opens media files.
12. Use worker status-transition helpers to claim ready work, reject stale
    attempts, and report completed outputs by checksum before persisting updated
    render status manifests through a single-task compare/write update.
13. Let the scheduler plan stale running leases from the trusted status
    manifest when a caller supplies an explicit cutoff, then persist each
    retryable transition through the same compare/write boundary with the
    observed `running_since` value as `expected_updated_at`, reporting
    same-attempt heartbeat refreshes as conflicts instead of clobbering them.
14. Exercise adapter orchestration with the dry-run renderer before introducing
    ffmpeg, Core Image/Metal, DaVinci Resolve, or cloud GPU backends. The
    adapter consumes only worker actions, refuses symlinked or different
    existing outputs, and never deletes source, graded, or deliverable files.
15. Use the dry-run batch scheduler to execute dependency-ready actions at a
    bounded local concurrency level, record stale-action failures without
    materializing outputs, and keep blocked/running/failed work visible for
    later retries or review.
16. Use the iterative dry-run scheduler to alternate trusted status reloads,
    guarded stale-lease expiration, ready-action planning, and bounded batch
    execution until the current render plan is complete, blocked, failed,
    waiting, or has retryable work that should not be hammered again without review.
17. Persist `deliverables/render_scheduler_report.json` against the trusted
    assembly plan and final render status so a Mac app, background agent, or next
    automation run can show what finished and what needs review without parsing
    worker internals.
18. Run the same handoff through `python -m shootflow.cli dry-run-render-scheduler`
    when a UI/background-agent process starts from persisted manifests instead of
    an in-memory production plan.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

- `docs/PRODUCT_STRATEGY.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
- `docs/CONTINUATION_NOTES.md`