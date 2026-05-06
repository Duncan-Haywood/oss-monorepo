# Architecture Notes

## Design principles

1. **Never destroy originals by default.** Source cards are read-only inputs until two verified copies exist and the user explicitly opts into source cleanup.
2. **Separate planning from execution.** The app first builds visible ingest, grading, and publishing plans. Execution workers consume those plans so failures can resume safely.
3. **Use deterministic intermediates.** Sidecars, checksums, thumbnails, proxies, graded masters, and social exports should be reproducible from the original asset plus recipe metadata.
4. **Exploit parallelism where quality allows.** Ingest checksum jobs, proxy generation, scene analysis, VLM captioning, and color candidate generation can run independently per asset or per scene.
5. **Keep creative taste inspectable.** AI should explain why a clip/photo was chosen and which look recipe was applied, so photographers can trust and tune it.

## Native app shape

- **macOS app:** Primary ingest, SSD/archive management, GPU-heavy video processing, batch review, and export orchestration.
- **iPhone app:** Shoot review, approval queue, social calendar, mobile capture handoff, lightweight grading previews, and publish-ready content review.
- **Shared core:** Media manifest schema, ingest plan rules, deliverable planning, look recipes, and project metadata.

## Pipeline

1. **Detect volumes**
   - Enumerate removable cards, camera volumes, SSDs, NAS mounts, and local libraries.
   - Classify candidate sources and destinations by mount path, filesystem, free space, read/write capability, and historical usage.
   - Require user confirmation before treating any drive as a destination.

2. **Ingest safely**
   - Build a manifest from file paths, size, capture time, metadata, and checksums.
   - Copy originals to a primary project structure.
   - Verify checksums against source.
   - Copy to a backup/archive when configured.
   - Verify backup checksums.
   - Only then allow optional source cleanup; never format cards automatically.

3. **Analyze**
   - Generate proxies and thumbnails.
   - Extract camera/log metadata, faces, motion, audio peaks, scene boundaries, sharpness, exposure, and composition.
   - Run VLM scoring for story moments, brand alignment, subject quality, and social usefulness.

4. **Grade**
   - Normalize log/raw assets to a scene-referred working space.
   - Generate multiple look candidates per lighting scene.
   - Use reference looks, previous user approvals, and brand mood to rank candidates.
   - Export high-quality intermediates plus non-destructive recipes/sidecars.

5. **Compose social deliverables**
   - Reels: hook-first timeline, pacing, captions, safe title area, music placeholders, and alternate cuts.
   - Carousels: 4:5 crop sequence with story arc and slide diversity.
   - Photo posts: hero selects, crop variants, captions, and hashtags.
   - Export platform-specific masters and review proxies.

6. **Review and iterate**
   - Batch accept/reject looks and selects.
   - Capture edits as taste preferences for future shoots.
   - Re-render changed outputs without re-running unchanged ingest or analysis.

## Current executable core

The `mediaflow` Python package is a small, testable planning core for this early repo:

- `plan_ingest` creates copy/verify/backup/delete plans and records duplicate skips.
- `plan_social_outputs` batches color work and creates reel/carousel/photo-post deliverable plans.

This is not the final app runtime. It is a verifiable model of product invariants that later Swift, Metal, and media-processing workers should preserve.

## Open design decisions

- Choose native persistence: SQLite/Core Data for local-first project manifests, with optional CloudKit sync for approvals.
- Decide whether heavy video render workers live in-app, as XPC services, or as a local daemon.
- Pick color pipeline primitives: Core Image/Metal for previews, AVFoundation/VideoToolbox for transcode, and optional DaVinci/FCPXML interchange for pro workflows.
- Define a taste-learning model that is useful without uploading private client shoots by default.
