# Next Agent Notes

This repo is intentionally early-stage. The first shipped slice is a tested
Python core for non-destructive media ingest planning.

## What changed in this iteration

- Added a `shootflow` Python package scaffold.
- Added `build_ingest_plan`, which:
  - discovers RAW, JPEG, and video files under a source root;
  - categorizes them into `raw/`, `jpeg/`, and `video/` destination lanes;
  - computes SHA-256 checksums for idempotency;
  - reports checksum conflicts instead of overwriting;
  - never plans deletion.
- Added product blueprint, legal terms draft, and a decision record explaining
  why safe ingest comes before AI editing.

## Suggested next slices

1. Add an execution layer that copies files from an `IngestPlan` with atomic
   temp-file writes, checksum verification after copy, and a JSON manifest.
2. Add drive/card detection abstractions for macOS volumes and external SSDs,
   with tests around ambiguous/missing/unmounted drives.
3. Add a media manifest model for later grading and reel generation queues.
4. Add a lightweight CLI for local testing before a macOS/iPhone UI exists.
5. Start the color grading architecture doc: proxy generation, scene clustering,
   LUT/look recipes, VLM curation, and human review checkpoints.

## Safety constraints to preserve

- Never delete source media.
- Never overwrite a destination file with different content.
- Treat copy verification as mandatory before marking ingest complete.
- Keep raw source storage separate from generated derivatives.
- Prefer resumable, manifest-driven operations over implicit filesystem state.
