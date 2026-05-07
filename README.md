# Media Content Automation

Personal-tool and product foundation for bulk photo/video ingest, organization, AI-assisted color grading, and automated social content generation.

The long-term product goal is a native Mac + iPhone workflow for photographers and videographers: dump a fresh shoot plus old footage from SD cards, local folders, or SSDs; preserve originals safely; generate color-graded intermediates; and assemble cinematic Instagram reels, carousels, still exports, captions, and editor handoff packages.

## Current slice

This repo currently implements the first trust-critical subsystem: a copy-only media ingest core.

It can:

- Recursively scan a source folder, SD card mount, or external drive path.
- Classify common RAW photo, JPEG/HEIC/TIFF, video, audio, and sidecar files.
- Plan deterministic destinations under `<library>/<shoot>/originals/<media_kind>/...`.
- Preserve nested camera folder paths.
- Avoid overwriting existing different files by writing collision-safe names.
- Copy files with SHA-256 verification.
- Write unique audit manifests under `<library>/<shoot>/manifests/`.
- Leave source media untouched.

## Quick start

Run tests:

```bash
python3 -m unittest discover -s tests
```

Dry-run an ingest:

```bash
python3 -m media_tool.cli \
  --source /Volumes/CAMERA_CARD \
  --library /Volumes/MediaSSD/MediaLibrary \
  --shoot smith-wedding-2026-05-07 \
  --dry-run
```

Execute an ingest:

```bash
python3 -m media_tool.cli \
  --source /Volumes/CAMERA_CARD \
  --library /Volumes/MediaSSD/MediaLibrary \
  --shoot smith-wedding-2026-05-07
```

## Safety posture

The ingest workflow is deliberately conservative:

- It never deletes source files.
- It verifies copied bytes with SHA-256 checksums.
- It writes a manifest for provenance and future AI/render jobs.
- It refuses silent overwrites.
- Formatting cards or deleting originals should remain outside this workflow and require independent backups plus explicit confirmation.

## Product notes

- Foundation design: `docs/superpowers/specs/2026-05-07-media-content-automation-foundation-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-07-safe-media-ingest-foundation.md`
- Product strategy: `docs/product/media-automation-product-strategy.md`
- Draft terms and indemnification language: `docs/legal/terms-and-conditions.md`