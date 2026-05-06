# ShootFlow Product Strategy

## Target customer

ShootFlow is for photographers and videographers who already have demand for short-form social content but lose too much time to media management, culling, color grading, and packaging deliverables for Instagram.

The primary wedge is not "AI edits your art automatically." The wedge is "your shoot becomes organized, backed up, graded, and turned into reviewable social assets with less manual coordination and fewer file-management mistakes."

## Core jobs to be done

1. Safely ingest cards and drives without deleting source media.
2. Organize raw, JPEG, video, and sidecar files into predictable shoot folders.
3. Create intermediate, high-quality color graded assets that remain inspectable.
4. Generate candidate Instagram reels, carousels, and photo sets from the shoot.
5. Let the user review, approve, refine, and export without losing creative control.

## Product principles

- **Never risk the shoot.** Source files are read-only inputs until the user independently confirms backups outside the app.
- **Intermediate artifacts matter.** Users should get graded photos, graded clips, selects, manifests, captions, and timelines, not only final reels.
- **Parallel by design.** Ingest, checksums, proxies, embeddings, VLM scene analysis, grading, and export planning should operate per asset or per clip segment with resumable manifests.
- **Human taste remains central.** The app should learn a photographer's looks and editor feedback, but it should expose candidates and deltas before final export.
- **Business viability comes from throughput plus trust.** A useful product saves editor coordination time and increases output volume without creating file-loss anxiety.

## Near-term technical roadmap

1. **Safe ingest foundation**: copy planning, drive ranking, manifests, checksum verification, conflict handling.
2. **Catalog layer**: SQLite or equivalent local catalog for shoots, assets, checksums, analysis status, and derivative paths.
3. **Proxy and analysis pipeline**: generate video proxies/thumbnails, photo previews, embeddings, VLM captions, quality scores, and scene clusters.
4. **Color pipeline**: LUT/look profiles, reference-image matching, raw processor integration, video grade presets, and per-camera normalization.
5. **Content assembly**: select moments, build timeline candidates, create carousel ordering, caption/hashtag drafts, and export recipes.
6. **Review UI**: macOS-first desktop workflow, then iPhone companion for review, approvals, and publishing handoff.

## Differentiation hypotheses

- File safety and organization can be as valuable as generation quality because lost or duplicated shoot media destroys trust.
- Reels and carousel automation should be opinionated around photographer workflows: deliver shoot recap, vendor teaser, client preview, BTS, hero carousel, and story cuts.
- The app should support users who already pay editors by creating better organized handoffs, more candidate assets, and faster turnarounds.

## Open business questions

- Pricing may work best as a pro desktop subscription with local processing plus optional cloud burst for VLM/video workloads.
- A personal-tool phase should focus on real shoot throughput metrics: ingest time, manual editing minutes avoided, number of usable exports, and rejected-output reasons.
- Marketplace risk is quality. The app must prove cinematic grade consistency before positioning itself as an editor replacement.
