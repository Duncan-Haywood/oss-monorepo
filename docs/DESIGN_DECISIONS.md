# Design decisions

## Product thesis

Photographers and videographers lose margin and creative energy to repetitive import, cull, color, export, and social packaging work. This product should act like a careful assistant editor: ingest the shoot, preserve originals, create consistent cinematic intermediates, and draft platform-native content packages that a human can approve quickly.

Primary users:

- Solo photographers and videographers who need more IG output with less editing time.
- Studios that already pay editors but want faster turnaround and more variants per dollar.
- Creators with large back catalogs who want reusable reels, carousels, and photo posts.

## Current architecture direction

The repository now starts with pure planning modules instead of UI or heavyweight media processing:

- `media_automation.ingest` creates side-effect-free import plans from SD cards or mounted drives.
- `media_automation.content_pipeline` creates side-effect-free job graphs for analysis, color grade, and deliverable assembly.

This separation is intentional. The future macOS/iPhone app and background workers can preview, approve, run, retry, and audit the same plans. It also lets us test deletion safety and parallel scheduling without depending on Xcode, FFmpeg, Metal, or a VLM service in CI.

## Safety decisions

- Default transfer mode is copy only.
- "Move" means verified copy followed by quarantine, not deletion.
- Source deletion is not represented in the ingest plan.
- Destination collisions are versioned rather than overwritten.
- Every planned copy records a SHA-256 digest for manifest/audit support.
- Non-media files are ignored with notes rather than treated as errors.

Future executor rules:

1. Never erase or format a card.
2. Verify destination bytes and checksums before marking a copy complete.
3. Quarantine originals only after verification and explicit user preference.
4. Keep a manifest beside every project.
5. Require a human confirmation for destructive cleanup outside the card quarantine.

## Media pipeline decisions

- Analysis and color grading are per-asset jobs and should be massively parallel.
- Deliverable assembly depends on graded intermediates and runs after per-asset work.
- VLM/video providers should be adapters behind the planner, not embedded in planner code.
- Graded intermediates are first-class outputs, not temporary files, so users can keep editing.
- Reels and carousels should be generated from a ranked story/selects layer, not raw filename order.

## Business direction

Near-term wedge:

- "Drop a shoot, get cinematic selects plus ready-to-review IG content."
- Compete against manual file wrangling, inconsistent editor turnaround, and underused archives.

Quality bar:

- Non-destructive workflow users can trust.
- Local-first handling for huge RAW/video libraries.
- Parallel GPU/cloud execution for scale.
- Human-in-the-loop approvals before publish or deletion.

Potential pricing:

- Personal desktop license for local-only use.
- Pro subscription for VLM/LLM story analysis, cloud burst rendering, and back-catalog automation.
- Studio tier for shared brand looks, editor review queues, and team storage policies.

## Next implementation slices

1. Add a real filesystem scanner that detects mounted cards/drives and emits `source_files` metadata without reading entire files into memory.
2. Replace in-memory bytes in `plan_ingest` with file metadata plus streaming checksum hooks.
3. Add an executor that copies to a staging path, verifies checksums, then atomically finalizes.
4. Add a project manifest serializer.
5. Add a VLM analysis interface and stub provider for shot type, people, location, quality, and story beats.
6. Add color look presets and provider interfaces for LUT/RAW/video backends.
7. Add social packaging planners for 9:16 reels, carousel sequences, captions, and export constraints.
8. Scaffold Swift app targets once the core planning contracts stabilize.
