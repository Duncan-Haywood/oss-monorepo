# PhotoFlow Target Architecture

## Guiding principles

1. Originals are immutable inputs.
2. Import, analysis, grading, and rendering are separate resumable stages.
3. Every destructive action requires verification, explicit intent, and audit.
4. Native devices should do what they are good at; cloud workers should be
   optional acceleration, not a requirement for basic safety.
5. Human edits are first-class feedback signals for future automation.

## Target app surfaces

### Mac app

The Mac app is the primary ingest, archive, analysis, and render workstation.

- Detect removable drives, SD cards, cameras, local folders, and SSD archives.
- Create shoot workspaces and import manifests.
- Generate proxies, thumbnails, embeddings, scene cuts, and technical metadata.
- Run bulk color grading and render jobs locally when hardware allows.
- Queue cloud jobs for expensive VLM analysis or batch rendering when enabled.
- Provide review UI for selects, looks, reel drafts, carousel drafts, and exports.

### iPhone app

The iPhone app should be a companion, not the first ingest workhorse.

- Review and approve selects, reels, captions, and carousel layouts.
- Capture style feedback: "warmer", "more contrast", "less orange skin", "use
  this pacing", "avoid this angle".
- Export or publish approved deliverables.
- Optionally ingest small phone-native shoots into the same archive model.

## Pipeline stages

### 1. Device detection

Inputs:

- mounted SD cards and CFexpress readers;
- camera volumes;
- local folders;
- external SSDs;
- iCloud/Photos library imports only with explicit user selection.

Outputs:

- candidate volumes with media counts, total bytes, camera hints, and risk
  warnings;
- a proposed destination archive and shoot name.

### 2. Import planning

The planner builds a manifest before copying:

- source path;
- destination path;
- media type and sidecar group;
- byte count;
- checksum;
- duplicate/collision status;
- required free space;
- copy/move/delete policy.

Current reference implementation: `photoflow/import_planner.py`.

### 3. Verified import

Execution should copy first, verify checksums, fsync where platform-appropriate,
and persist a manifest. Moves are copy-plus-verified-delete, never a blind rename
from removable media. Failed imports must be resumable.

### 4. Media normalization

- Extract EXIF, timecode, camera model, lens, frame rate, resolution, color
  profile, log curve, and audio metadata.
- Generate thumbnails and proxies.
- Normalize capture times across cameras with drift correction.
- Cluster raw+JPEG+XMP sidecars and video+audio sidecars.

### 5. AI analysis

Parallel jobs:

- technical reject detection: blur, missed focus, under/over exposure, rolling
  shutter, bad audio, accidental clips;
- semantic tagging: people, products, wardrobe, location, action, emotion;
- scene/take grouping and highlight detection;
- composition and crop suitability for 1:1, 4:5, and 9:16;
- transcript and audio beat markers for reels;
- brand/client safety rules.

VLM outputs should be structured JSON with model name, prompt version, confidence,
and source asset references.

### 6. Color pipeline

The color system should combine deterministic image processing with learned style
selection:

- camera/log profile detection;
- technical transform into a working color space;
- exposure and white-balance normalization;
- look selection from user/client memory;
- local adjustments for faces, sky, product, and mixed lighting;
- batch consistency pass across a scene;
- export of graded intermediates and editable sidecars/LUTs.

Quality target: preserve skin tones and highlight rolloff before chasing a trendy
look.

### 7. Deliverable generation

Reel drafts:

- select narrative arc;
- choose 9:16 crops with safe margins;
- sequence clips by energy and beat markers;
- avoid repeated near-duplicate shots;
- create variants for slow cinematic, punchy social, and client-safe review.

Carousel drafts:

- cover image;
- establishing shot;
- detail/texture frames;
- people/product proof;
- closing frame or CTA;
- alternate crops for 4:5 and square.

Photo exports:

- single hero photos;
- client galleries;
- social crops;
- editor handoff folders.

### 8. Review and feedback loop

User feedback should be captured as reusable structured preferences:

- per-client grade choices;
- rejected crop reasons;
- pacing preference;
- caption tone;
- do-not-use people, brands, or moments;
- export defaults.

## Storage model

Suggested archive layout:

```text
Archive/
  2026/
    2026-05-07_Downtown-Night/
      00_manifest/
      01_originals/
      02_proxies/
      03_analysis/
      04_grades/
      05_drafts/
      06_exports/
      07_handoff/
```

The manifest is the source of truth. Folder names are human-friendly views of
manifest state, not the only record.

## Parallelization model

- Ingest: bounded concurrent copies by volume to avoid saturating removable media.
- Hashing: chunked streaming checksums; reuse manifest hashes.
- Thumbnails/proxies: CPU/GPU worker pool.
- VLM: batch prompts by scene, asset type, and model cost.
- Grading: scene-level batches with consistency checks.
- Rendering: separate queue with resumable artifacts.

The scheduler should prefer local work first, then cloud acceleration for jobs
that are expensive or unavailable on the user's hardware.

## Open technical decisions

- Native stack: SwiftUI + AppKit escape hatches for Mac volume/file workflows.
- Video engine: AVFoundation/VideoToolbox/Metal locally; cloud render workers
  only when user opts in.
- Project database: SQLite is a strong local default; manifests should also be
  exportable as JSON for portability.
- Model providers: abstract model calls behind prompt-versioned adapters so
  quality can improve without changing project data.
