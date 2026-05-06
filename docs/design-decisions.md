# Design Decisions

## Architecture shape

The product should be a local-first Mac + iPhone workflow with a portable core:

- **Rust media orchestration core** for ingest plans, manifests, hashing,
  scheduling, and safe file operations. Rust gives predictable performance and
  clean FFI options for Swift.
- **SwiftUI Mac app** for heavy desktop workflows: drive detection, review,
  export, and batch controls.
- **iPhone companion** for remote review, selects, voice notes, references,
  caption approval, and lightweight posting prep. iOS should not be the first
  place for large RAW/video ingest.
- **Pluggable processors** for local tools and models: FFmpeg, VideoToolbox,
  Core Image, Metal Performance Shaders, Core ML, Lightroom/Resolve export
  adapters, and optional cloud/VLM workers.

## Safety model for camera media

Originals are treated as immutable source material.

1. Detect candidate source drives and show the user why a drive looks like a
   camera card: DCIM, PRIVATE, AVCHD, M4ROOT, known camera folder names, and
   media extensions.
2. Build an ingest plan before copying anything.
3. Copy to a destination library using deterministic paths.
4. Verify bytes with size and content hash before marking an item ingested.
5. Never delete from the card or original folder in automated flows.
6. If a user later wants cleanup, require explicit confirmation, at least one
   verified copy, and preferably a second backup target.
7. Write an append-only manifest/audit log for every operation.

The current Rust core implements step 2 for absolute local paths and
intentionally emits only `CopyThenVerify` operations. Execution code must still
walk source drives without following unsafe symlinks and pass existing
destination paths into the planner as reserved destinations before copying.

## Library layout

The initial layout groups by shoot slug and media kind while preserving relative
camera structure:

```text
MediaLibrary/
  2026-05-06-client-shoot/
    raw/100MSDCF/A7IV_0001.ARW
    jpeg/100MSDCF/A7IV_0001.JPG
    video/PRIVATE/M4ROOT/CLIP/C0001.MP4
    sidecar/100MSDCF/A7IV_0001.XMP
    other/...
```

This favors traceability over clever renaming. Shoot slugs are validated as a
single safe path component so a bad slug cannot escape the destination library.
Later manifests can support friendly display names without changing original
file paths.

## High-parallel processing model

The pipeline should be modeled as a DAG:

1. Ingest and hash originals.
2. Extract metadata and thumbnails.
3. Generate proxies and audio waveforms.
4. Score frames/clips for technical quality and content usefulness.
5. Cluster moments, scenes, subjects, and duplicates.
6. Apply look proposals and render graded intermediates.
7. Assemble reels, carousels, still exports, captions, and delivery manifests.
8. Run critique passes and propose revisions.

Each node should declare inputs, outputs, idempotency keys, resource needs, and
failure behavior. That makes 10,000s of files tractable: completed work is
cached, failed nodes retry, and independent media units run in parallel.

## VLM and quality strategy

VLMs should act as taste and planning agents, not as the only media processor.
Use deterministic image/video tools for color transforms and rendering, while
using VLMs to:

- understand shoot context and user direction
- compare candidate looks against references
- select hero frames, story beats, and carousel ordering
- critique reels for pacing, variety, and brand fit
- generate captions, hooks, and export variants

Color work should preserve editable intermediates: LUTs, sidecars, graded JPEGs,
graded video proxies, and project timelines where possible.

## Business-facing product decisions

- The first experience must be trustworthy before it is magical. If ingest feels
  risky, professional users will not let the app near their cards.
- The product should complement human editors by giving them organized,
  high-quality starting points and more options per shoot.
- Every automated edit should be inspectable: sources, settings, prompts,
  models, LUTs, and render commands should be recoverable from a manifest.
