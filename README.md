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
- `shootflow.storage` ranks possible source and destination drives
  conservatively.
- `shootflow.deliverables` builds initial Instagram deliverable job plans.
- `shootflow.story` turns VLM analysis scores into ranked first-cut reel,
  carousel, photo-set, and named reel-variant recommendations, then persists
  the selections as a deterministic `analysis/instagram_storylines.json`
  edit-decision artifact.
- `shootflow.production` expands a shoot into deterministic proxy, VLM
  analysis, look-development, grading, storyline selection, and Instagram
  packaging waves.

The intended first workflow is:

1. Plan and execute a safe import from a card, folder, or SSD.
2. Keep the generated `ingest_manifest.json` as the boundary between file
   management and AI/editing work.
3. Load the manifest with `shootflow.catalog`, which rechecks manifest
   location, destination paths, file sizes, and checksums before production.
4. Build production waves from manifest-backed photo/video assets so proxies,
   VLM analysis, color decisions, graded masters, storyline choices, and
   Instagram packages all trace back to verified originals.
5. Load VLM results with `shootflow.analysis` so social planning consumes graded
   artifact paths and rejects analysis that does not match the planned source
   assets.
6. Persist `shootflow.story` selections as a trusted storyline artifact for
   downstream reel, reel-variant, carousel, and photo-set assemblers.
7. Build `shootflow.assembly` render tasks that verify selected graded files
   exist, keep raw originals out of social assembly inputs, and write
   deterministic `deliverables/` targets for future renderers. Large ranked
   photo sets are split into resumable chunks while preserving stable public
   output names like `photo_00001.jpg`; named reel variants render under
   `deliverables/instagram_reels/` without replacing the default reel handoff.
8. Persist and reload `deliverables/render_tasks.json` against the trusted
   assembly plan so parallel render workers cannot consume model-authored or
   stale task JSON.
9. Persist and reload `deliverables/render_status.json` against the same trusted
   render tasks so a Mac app, local renderer, or cloud worker can show pending,
   running, succeeded, failed, and retryable work safely.
10. Derive renderer-neutral worker actions from the trusted task/status pair
    before any ffmpeg/Core Image/DaVinci/cloud adapter opens media files.
11. Use worker status-transition helpers to claim ready work, reject stale
    attempts, and report completed outputs by checksum before persisting updated
    render status manifests through a single-task compare/write update.
12. Let the scheduler plan stale running leases from the trusted status
    manifest when a caller supplies an explicit cutoff, then persist each
    retryable transition through the same compare/write boundary with the
    observed `running_since` value as `expected_updated_at`, reporting
    same-attempt heartbeat refreshes as conflicts instead of clobbering them.
13. Exercise adapter orchestration with the dry-run renderer before introducing
    ffmpeg, Core Image/Metal, DaVinci Resolve, or cloud GPU backends. The
    adapter consumes only worker actions, refuses symlinked or different
    existing outputs, and never deletes source, graded, or deliverable files.
14. Use the dry-run batch scheduler to execute dependency-ready actions at a
    bounded local concurrency level, record stale-action failures without
    materializing outputs, and keep blocked/running/failed work visible for
    later retries or review.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

- `docs/PRODUCT_STRATEGY.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
- `docs/CONTINUATION_NOTES.md`