# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in this iteration

- Merged the prior `shootflow` foundation onto the active branch.
- Added `shootflow.story` for deterministic VLM-driven content selection:
  - validates per-asset analysis paths, media types, scene labels, and scores;
  - builds a first-cut reel from high-scoring video selects with scene diversity;
  - builds a carousel from scene-diverse photo selects;
  - preserves a full ranked photo set so valuable graded intermediates are not dropped.
- Updated production planning so Instagram deliverable assembly depends on a serialized `rank_instagram_storylines` job after scene grouping/look development and before reel/carousel/photo-set assembly.
- Expanded product/legal docs around the story-planning layer, indemnification caution, and file deletion safety.

## Design decisions to preserve

- Source media deletion remains out of scope.
- Ingest manifests are the boundary between file operations and AI/editing work.
- VLM/story outputs may rank and select content, but must not drive destructive file actions.
- First-cut reel selection intentionally prefers one strong clip per scene before repeated coverage. Future iterations can add alternate reel variants for longer cuts.
- Full photo-set exports stay ranked but not capped; carousel is capped for Instagram.

## Suggested next iteration

Add a manifest-backed analysis loader that turns per-asset VLM JSON outputs into `AssetAnalysis` objects and rejects unsafe or incomplete analysis files. That would connect the production job graph to the new story planner without needing a renderer yet.

Good test-first targets:

- Load `analysis/00000.json` style files and bind them to graded artifact paths.
- Reject analysis for assets not present in the verified catalog/production plan.
- Reject non-finite scores, missing scene labels, unsupported media types, and negative durations.
- Ensure 10,000 analysis records can be loaded into a storyline plan without pairwise scene comparisons.
