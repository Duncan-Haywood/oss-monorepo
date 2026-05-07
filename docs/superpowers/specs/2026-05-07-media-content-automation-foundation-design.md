# Media Content Automation Foundation Design

## Product direction

This project is a personal tool and future product for photographers and videographers who need faster, higher-quality Instagram delivery from large shoots. The core promise is: ingest a shoot from SD cards, local folders, or SSDs; preserve originals safely; produce organized intermediates; bulk color grade photos and videos; and assemble reels, carousels, still exports, and review artifacts with minimal operator effort.

The first build slice focuses on the part that must be trustworthy before any AI editing is useful: safe media ingest and organization. It creates a tested, non-destructive ingest planner/executor that can classify common photo/video/raw formats, plan stable destination paths, copy files with checksums, and write an audit manifest. This becomes the substrate for Mac and iPhone app flows, local/remote render workers, and later vLLM-driven creative decisions.

## Audience and jobs

- Wedding, event, travel, portrait, and commercial shooters with 1,000 to 50,000 assets per job.
- Creators who want more reels and carousels without spending hours in file management and edit queue setup.
- Studios already paying editors who want faster turnaround, higher content quantity per dollar, and fewer asset handoff mistakes.

Primary jobs:

1. Pull files from cards or external drives without risking deletion.
2. Normalize folder structure across old and new shoots.
3. Identify media by type so RAW, JPEG, sidecars, video, audio, and project files are handled intentionally.
4. Preserve provenance so every export can be traced back to originals.
5. Prepare clean batches for future color grading, culling, and social-package generation.

## Scope for this slice

In scope:

- A Python reference implementation of the ingest core that can run in automation and be ported to Swift later.
- Classification for common camera photo/video/audio/sidecar extensions.
- Deterministic destination paths under a project root.
- Copy-only execution with SHA-256 verification.
- JSON manifest output including source, destination, media kind, size, checksum, and status.
- Tests for classification, planning, duplicate handling, and copy verification.
- Product, architecture, and legal notes that future agents can build from.

Out of scope for this slice:

- Native Mac/iPhone UI.
- Real vLLM inference, CLIP scoring, LUT generation, video render pipelines, or Instagram publishing.
- Deleting, formatting, or mutating source cards.
- Cloud job orchestration.

## Architecture

The product should be split into three layers:

1. **Capture safety layer**: discovers drives, plans imports, copies originals, verifies bytes, and writes manifests. This must be deterministic, testable, and conservative.
2. **Creative intelligence layer**: runs metadata extraction, perceptual dedupe, culling, shot grouping, style matching, color grading, storyboarding, caption/hashtag drafts, and edit selection. This may combine local models, vLLM-hosted models, and human review.
3. **Delivery layer**: renders Lightroom/DaVinci/Final Cut-friendly intermediates plus ready-to-post reels, carousels, covers, thumbnails, captions, and client review packages.

The ingest core lives outside native UI concerns so Mac, iPhone, CLI, and background worker entry points can all share the same behavioral contract. The Python version is a reference and test harness; a later native implementation can mirror its manifest format.

## Data flow

1. User selects or the app detects a source volume/folder.
2. The ingest core scans recursively and ignores hidden/system files by default.
3. Each supported asset receives a `MediaAsset` record with source path, relative path, extension, media kind, file size, and modified time.
4. The planner assigns a destination path: `<library>/<shoot_slug>/originals/<media_kind>/<relative_path>`.
5. Name collisions are made explicit by appending a short source-path hash before the extension.
6. Executor copies bytes to a temporary file in the destination directory, computes source and destination SHA-256, then links into place without overwriting any newly created destination.
7. A unique manifest is written to `<library>/<shoot_slug>/manifests/` for each ingest session.
8. Later grading/render jobs consume the manifest instead of rescanning ambiguous folders.

## Safety and deletion policy

- The app never deletes source files during ingest.
- Source drives/cards are read-only from the product's perspective.
- Copy success requires matching SHA-256 checksums.
- If destination already exists with matching checksum, mark the asset as already copied rather than overwriting.
- If destination exists with a different checksum, use a collision path and preserve both files.
- Manifest files are unique per ingest so repeated card imports preserve audit history.
- Any future "card clear" workflow must be a separate, explicit, multi-confirmation feature that verifies at least two independent copies and a manifest first. It is intentionally not present now.

## Future color and content system

The eventual high-quality pipeline should use staged automation:

- **Technical analysis**: EXIF, camera profile, lens, white balance, exposure, face/object detection, scene type, motion blur, audio peaks, clip length, and duplicate clusters.
- **Creative selection**: vLLM/vision-language ranking for story moments, brand fit, emotion, novelty, and social usefulness.
- **Color grading**: camera-profile-aware normalization, reference look matching, LUT generation, shot-to-shot consistency, skin tone protection, and manual review checkpoints.
- **Assembly**: reel timelines, carousel sequencing, photo export crops, captions, cover frames, safe-area checks, and variant generation.
- **Learning loop**: store accepted/rejected edits, export performance, and user corrections to improve defaults per photographer.

## Testing strategy

The ingest core should be covered by unit tests using temporary directories and real file copies. Tests must prove:

- Supported media extensions classify correctly.
- Unsupported files are skipped.
- Destination planning is deterministic and keeps nested relative paths.
- Collisions never overwrite bytes.
- Copy execution verifies checksums and writes a manifest.

Native UI, drive detection, and render pipelines should eventually add integration tests around actual removable volume simulations and fixture media.

## Design decisions

- Start with ingest safety, not AI grading, because every later feature depends on reliable originals and provenance.
- Use a manifest-first pipeline so future agents can make progress without guessing where files came from.
- Keep delete workflows out of the first implementation to avoid irreversible data-loss risk.
- Use Python for the reference implementation because this environment can test it; preserve simple data shapes that can be ported to Swift.
- Treat legal terms as product documentation now, not a substitute for attorney review.
