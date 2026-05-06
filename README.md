# Media Content Automation

Personal-tool and product prototype for bulk photo/video ingestion, AI-assisted
color grading, and automated Instagram-ready content generation.

The intended user is a photographer, videographer, or creator who wants the
turnaround and file-management reliability of a strong assistant editor without
losing creative control. The long-term shape is a Mac app plus iPhone companion:
drop in a latest shoot, old footage, RAW/JPEG/video/log files, and sidecars; the
system organizes the media, plans safe transfer operations, grades assets in
bulk, and creates reels, carousels, selects, and intermediate exports.

## Current executable slice

This repository currently contains pure Python planning utilities that model the
dangerous and expensive parts of the workflow before any app UI or renderer
executes them:

- `media_automation.ingest`
  - Classifies RAW, JPEG/HEIC, video, audio, and XMP sidecar files.
  - Plans copy-first imports from SD cards or mounted drives.
  - Avoids overwrites by versioning destination filenames.
  - Supports a `move_after_verify` mode as copy plus quarantine, never direct
    source deletion.
  - Emits checksummed manifest entries for auditability and later verification.
- `media_automation.content_pipeline`
  - Converts an ingest manifest into a dependency-aware content job graph.
  - Separates parallel VLM analysis and color grade jobs from serial deliverable
    assembly.
  - Plans reel, carousel, and photo-select outputs under a project export root.

Run the tests:

```bash
python3 -m unittest
```

## Product principles

1. No destructive file actions by default. Deletion should require explicit user
   confirmation, successful checksum verification, and a recoverable quarantine
   period.
2. Keep originals, intermediates, and deliverables separate. RAW/log/source media
   is an archive asset; graded intermediates and social exports are products of
   reproducible jobs.
3. Make parallelism explicit. Per-asset analysis and grading should fan out
   across local GPU, Apple Neural Engine/Core ML, cloud workers, or render nodes;
   editing/assembly jobs should depend on the completed candidates.
4. Preserve creative taste. VLMs should rank, caption, and suggest edits, but the
   system should retain style profiles, LUT references, and human override hooks.
5. Optimize for business value. The first paid wedge is faster IG output and
   cleaner file management for photographers already spending money or time on
   editors.

## Repository map

```text
media_automation/
  ingest.py             Safe media import planner
  content_pipeline.py   Parallelizable analysis/grading/deliverable planner
tests/
  test_ingest_plan.py
  test_content_pipeline.py
docs/
  DESIGN_DECISIONS.md
  CONTINUATION_NOTES.md
TERMS.md
```

## Near-term build direction

The next useful increments are:

1. Add a filesystem-backed executor for ingest plans that performs copy,
   checksum verification, manifest writing, and quarantine using dry-run by
   default.
2. Add drive detection abstractions for macOS mounted volumes and external SSDs,
   with a scoring model for likely camera cards versus archives.
3. Add media probing metadata using `ffprobe`/ExifTool adapters behind interfaces
   so tests can stay dependency-free.
4. Add a SwiftUI Mac shell that previews ingest plans and requires confirmation
   before execution.
5. Add local/cloud provider interfaces for VLM analysis, color transforms, and
   render assembly.