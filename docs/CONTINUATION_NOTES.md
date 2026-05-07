# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in the prior iteration

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

## What landed in the previous iteration

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

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation and pushed it
  to `cursor/media-content-automation-4a21`.
- Added `shootflow.render_status` as a strict render-worker progress contract:
  - `RenderTaskStatus` records are keyed by trusted task ID and must appear in the same order as the current
    `AssemblyPlan`;
  - status manifests include a canonical render-plan SHA-256 fingerprint so stale manifests for the same
    task IDs/outputs cannot mark newly selected media as already rendered;
  - `deliverables/render_status.json` round-trips through exact schema validation and symlink-safe temp
    writes, using exclusive no-follow temp creation and rejecting stale canonical temp files;
  - supported states are `pending`, `running`, `succeeded`, `failed`, and `retryable`;
  - worker-reported statuses can include renderer adapter name, attempts, error messages, output checksums,
    and timestamps, with state-specific validation;
  - succeeded tasks must include SHA-256 checksums for exactly the task's expected deliverable outputs;
  - status manifests cannot introduce unknown task IDs, source-media paths, arbitrary output paths, unknown
    fields, or delete instructions.
- Updated README/product/design docs to include the status handoff as the bridge between trusted render task
  planning and future renderer adapters.

## Suggested next iteration

The render-worker status contract is now in place. A useful next layer is a dry-run renderer adapter
contract that consumes trusted `RenderTask` records plus `RenderStatusManifest` records, decides which
tasks are ready to run or retry, and writes planned worker actions without opening or rendering media yet.

Good test-first targets:

- Add a `shootflow.render_worker` or similarly named module that derives ready work from an
  `AssemblyPlan` and `RenderStatusManifest`.
- Treat `pending` and `retryable` tasks as runnable only when their dependencies are satisfied by trusted
  production jobs/statuses; keep `running` tasks out of duplicate scheduling until a timeout policy exists.
- Emit a renderer-neutral worker action plan that references task IDs and `RenderTask` inputs/outputs, not
  arbitrary status-file paths.
- Keep real rendering out of scope for this pass. The contract should make future ffmpeg/Core Image/DaVinci
  adapters easy to plug in while preserving the no-delete/no-source-path invariants.
