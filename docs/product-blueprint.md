# ShootFlow Product Blueprint

ShootFlow is a personal tool and potential product for photographers and videographers who want the output of a strong editor without the turnaround time, file-management friction, and limited content volume of a fully manual workflow.

## Primary customer

- Working photographers and videographers delivering social-first content.
- Creators with large back catalogs who want fresh reels, carousels, and stills.
- Studios already paying editors but wanting faster iteration, more candidate cuts, and less operational overhead.

## Jobs to be done

1. **Ingest safely**
   - Detect SD cards, cameras, phones, local folders, and SSDs.
   - Copy media into a durable shoot archive without deleting originals.
   - Produce manifests that prove what was copied, skipped, or conflicted.

2. **Normalize and prepare**
   - Group RAW, JPEG, log, and video assets by shoot, camera, timestamp, and scene.
   - Generate proxies, thumbnails, embeddings, transcript tracks, and visual quality signals.
   - Preserve originals and treat derived media as reproducible intermediates.

3. **Grade in bulk**
   - Apply cinematic looks consistently across 10,000s of images and clips.
   - Use reference looks, local/global color analysis, camera profile awareness, and VLM feedback.
   - Keep human-review checkpoints for selects and final exports.

4. **Generate social outputs**
   - Build IG reels, carousels, still posts, and story variants from the same shoot graph.
   - Rank candidates by visual quality, subject prominence, motion, moment density, and brand fit.
   - Export platform-specific aspect ratios, captions, cover frames, and review bundles.

## Quality bar

- Never destroy source media automatically.
- Every automated action should be traceable in a manifest.
- High-throughput workflows must be resumable and idempotent.
- The product should optimize for fewer editor handoffs, faster turnaround, and more usable content per shoot.
- AI should propose and iterate, but humans retain final control over destructive operations and publishing.

## Technical direction

- **Mac app:** local-first orchestration, drive detection, previews, review UI, Apple Silicon acceleration.
- **iPhone companion:** shoot import, mobile review, capture context, and optional on-device quick selects.
- **Processing core:** deterministic Python/Swift/Rust workers for ingest, manifests, proxy generation, and exports.
- **AI layer:** VLM-based curation, color critique, storyboard selection, captioning, and iterative reel review.
- **Storage model:** source archive + derived intermediates + export packages, all linked by content hashes and manifests.

## Near-term implementation path

1. Safe ingest planner and manifest execution.
2. Drive/source detection model for removable media.
3. Shoot archive schema and resumable copy engine.
4. Thumbnail/proxy generation.
5. Select ranking for photos and clips.
6. Look/reference system for bulk color grading.
7. Reel/carousel assembly pipeline.
8. Review UI and export presets.

