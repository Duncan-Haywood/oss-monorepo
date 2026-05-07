# ShootFlow Design Decisions

ShootFlow is a personal tool and product concept for photographers and videographers who want more finished social content with less file-management and editing overhead. The first implementation layer is a conservative core engine that can be shared by a future Mac app, iPhone app, background agent, and cloud/GPU workers.

## Product shape

- Start as a desktop-first Mac workflow because large RAW/video shoots, SD cards, and external SSDs are easiest to manage locally.
- Add iPhone capture/review later as a companion: approve selects, review grades, post drafts, and kick off exports.
- Keep local storage and originals as the source of truth. AI may suggest, rank, grade, crop, and assemble, but the system should make provenance and reversibility obvious.
- Treat Instagram Reels, carousels, and feed photos as first-class deliverables, not as a final export checkbox.

## Safety invariants

- Never delete source media during ingest.
- Never overwrite an existing destination file with different bytes.
- Verify copies with SHA-256 before treating an import as complete.
- Write ingest manifests so later editing jobs can reference immutable originals and checksums.
- Reject symlink-based source or destination paths in the core importer. This is intentionally strict because camera-card imports are high-trust, high-value operations.
- Rank detected drives conservatively. Camera-card-like volumes are review-only sources; large writable SSDs can be automatic destination candidates.

## Core architecture

The repo currently contains a Python core package because it is quick to test and can model the critical workflow contracts before native UI work starts.

- `shootflow.ingest`: media discovery, import planning, checksum copy execution, and manifest writing.
- `shootflow.catalog`: manifest loading, path validation, media typing, and the boundary between safe
  imports and production planning.
- `shootflow.analysis`: VLM JSON loading that trusts the production plan instead of arbitrary model
  output paths, validates analysis values, and binds story inputs to graded artifacts.
- `shootflow.storage`: drive/storage candidate ranking for future Mac/iPhone device detection layers.
- `shootflow.deliverables`: parallelizable job planning for graded intermediates and Instagram outputs.
- `shootflow.production`: shoot-level execution planning with proxy, VLM analysis, scene grouping, look
  development, grading, and Instagram packaging waves.
- `shootflow.story`: VLM-score-driven selection planning for first-cut reels, carousels, and ranked
  photo-set exports, plus a deterministic storyline artifact contract for downstream assemblers.
- `shootflow.assembly`: a renderer-neutral handoff from trusted storyline selections to explicit social
  render tasks. It verifies selected graded artifacts exist, rejects symlinked selected media, keeps raw
  originals out of render inputs, derives deterministic output paths under `deliverables/`, and persists
  strict render manifests for future workers.

Future native applications should wrap these contracts rather than reimplementing the safety rules in UI code.

## AI/color pipeline direction

The desired high-quality pipeline is:

1. Ingest originals to a dated shoot folder.
2. Generate proxies and technical metadata in parallel.
3. Run content understanding: scene grouping, face/object/context tags, sharpness, exposure, motion, audio energy, and duplicate detection.
4. Build look references from user presets, past shoots, brand mood boards, or a hero frame.
5. Generate non-destructive color decisions per scene/set, not isolated per asset.
6. Rank storylines from VLM outputs so first-cut reels and carousels have narrative and scene variety.
7. Export graded intermediates for all selects.
8. Plan assembly tasks from trusted graded selections before invoking any renderer.
9. Assemble deliverables: reels, carousels, photo sets, story crops, thumbnails, captions, and suggested posting packages.
10. Iterate using reviewer feedback: "warmer skin," "more cinematic contrast," "use more behind-the-scenes," "make it faster."

High quality depends on scene-level consistency and reversible edits. The system should produce edit decision data first, then render from masters.

## Parallelism model

- Per-asset analysis and initial grading jobs are embarrassingly parallel.
- Scene clustering, look normalization, and deliverable assembly depend on per-asset outputs.
- Reels should assemble from proxy timelines, then conform from graded masters.
- The job graph should be deterministic and resumable so 10,000+ asset shoots can recover from interruption without starting over.
- The production planner uses explicit execution waves:
  1. proxy every asset;
  2. run per-asset VLM/content analysis;
  3. group scenes and narrative sets;
  4. derive a shoot-level look;
  5. render per-asset graded masters in parallel;
  6. rank IG storylines from analysis, scene, and look data;
  7. assemble social packages from the graded masters.
- This structure keeps expensive per-asset work highly parallel while preserving quality-critical global
  decisions, especially scene consistency and look development.

## Production planning notes

- Job IDs are deterministic for a fixed manifest order so later workers can cache, retry, and resume
  individual assets within a planned shoot. A future manifest-backed ID should incorporate relative path
  and checksum when the ingest manifest becomes the canonical production input.
- Ingest manifests are the handoff contract from file operations to AI/editing work. Catalog loading
  validates that manifest destinations stay under the import root, rejects destructive-source manifests,
  rechecks destination size/checksum, and ignores non-photo/video assets for production planning while
  preserving them in the original ingest manifest.
- VLM analysis files are not trusted just because they exist. `shootflow.analysis` loads only the
  `analysis/00000.json` style files declared by the production plan, requires each file to name the
  planned source asset, rejects unplanned numbered analysis files, validates scores/durations/tags, and
  emits `AssetAnalysis` records that point at graded artifacts rather than originals.
- Jobs expose explicit output artifacts. Instagram deliverables consume graded-master artifacts, not raw
  originals, which keeps social assembly downstream of the color pipeline.
- Per-asset proxy and graded artifacts are namespaced by job ID so common camera filenames such as
  `IMG_0001.CR3` do not collide across cards or archive folders.
- Deliverables depend on matching graded masters, not raw originals. Reels only depend on video grades;
  carousels and photo sets only depend on photo grades.
- `shootflow.story` currently chooses a first-cut reel from the best clip per scene, carousels from
  diversified photo selects, and photo sets from every graded photo ranked by quality. This keeps the
  automatic output useful while still preserving all graded intermediates for human/editor review.
- Storyline selection persists to `analysis/instagram_storylines.json` as an edit-decision contract
  with reel, carousel, and photo-set sequences. The reader rejects references outside the trusted
  graded artifact set so model-authored JSON cannot smuggle arbitrary files into a renderer.
- Assembly planning consumes that storyline artifact and rechecks selected graded files on disk before
  producing render tasks. Reel tasks use selected graded videos only; carousel and photo-set tasks use
  selected graded photos only. Outputs are deterministic (`deliverables/instagram_reel.mp4`,
  ordered carousel slides, and ordered photo-set JPEGs) so retries and UI review do not reshuffle the
  package.
- `deliverables/render_tasks.json` is the render-worker handoff. The loader requires exact JSON fields,
  safe analysis/graded inputs, deliverables-only outputs, no symlinked manifest/temp paths, and an exact
  match with the trusted in-memory `AssemblyPlan` before a renderer may consume it.
- The current planner is intentionally an edit-decision contract, not a renderer. Future renderers can be
  local Metal/Core Image, ffmpeg/LUT, DaVinci Resolve automation, or cloud GPU workers as long as they
  honor the same job IDs and dependencies.
- VLM output should feed structured scene, subject, quality, and narrative metadata. It should not make
  destructive storage decisions.

## Business viability notes

Primary buyers:

- Photographers and videographers who need more Instagram output but want time back from culling, editing, and file management.
- Small studios already paying editors who want faster turnaround, better consistency, and more content per dollar.
- Creators with large archives who want old footage turned into new reels and carousels.

Useful wedges:

- "Dump a card, get organized imports and draft IG packs."
- "Turn a wedding/editorial/event shoot into 3 reels, 2 carousels, and graded selects overnight."
- "Consistent look across photo and video without managing files by hand."
- "Know exactly what is ready, rendering, blocked, or safe to retry in a 10,000-asset shoot."

Avoid competing only on generic AI editing. The differentiator is end-to-end workflow: ingest safety, organization, grade consistency, social packaging, and iteration.

## Open decisions for future iterations

- Native stack: Swift/SwiftUI plus a Python/Rust worker, or a Tauri/Electron shell with native media extensions.
- Color engine: LUT/CDL/ACES-style decision layer, Core Image/Metal renderer, DaVinci Resolve integration, or hybrid.
- VLM providers: local model support for privacy vs. hosted APIs for quality and throughput.
- Sync model between Mac and iPhone.
- Pricing: one-time pro tool, subscription, or usage-based render credits.
