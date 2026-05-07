# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in this iteration

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
- First-cut reel selection intentionally prefers one strong clip per scene before repeated coverage. Future iterations can add alternate reel variants for longer cuts.
- Full photo-set exports stay ranked but not capped; carousel is capped for Instagram.

## Suggested next iteration

Add render task grouping for high-volume exports before implementing a renderer. The current manifest can
represent whole reel/carousel/photo-set tasks, but 10,000-photo shoots need chunked, resumable photo export
groups so failures do not restart an entire ranked photo set.

Good test-first targets:

- Split large `photo_set` sequences into deterministic chunk tasks while preserving the public
  `deliverables/instagram_photo_set/photo_00001.jpg` output naming.
- Keep reel and carousel tasks whole, but allow photo-set chunks to run in parallel after storyline and
  grade dependencies are satisfied.
- Extend the render manifest loader to reject duplicate output paths across chunked tasks.
- Document a renderer adapter interface that can later be implemented by local Core Image/Metal, ffmpeg,
  DaVinci Resolve automation, or cloud GPU workers without changing ingest or story contracts.
- Model multiple reel variants next (`hero`, `behind_the_scenes`, `fast_cut`) once chunked photo exports
  are stable.
