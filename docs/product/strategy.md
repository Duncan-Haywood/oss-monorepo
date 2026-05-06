# Product Strategy: MediaFlow

## Target customer

MediaFlow is for photographers and videographers who regularly turn shoots into Instagram reels,
carousels, photo posts, and client-ready selects. The best first customer already has strong taste
but loses time to ingest, backup, culling, color matching, export variants, and handoffs to editors.

## Problem

Modern shoots create too many assets for manual social-content production:

- SD card ingest is risky and repetitive.
- Log, RAW, JPEG, and mixed camera footage need consistent organization before editing can begin.
- Editors are expensive, slow to brief, and often bottleneck social output quantity.
- AI tools can generate clips, but they usually ignore file safety, color science, provenance, and
  the practical workflow of a working shooter.

## Product thesis

The winning product is not just "AI edits my video." It is a trusted media operations system:

1. Detect camera cards and drives.
2. Copy and verify media before destructive operations are even available.
3. Build an asset graph for RAW, JPEG, log video, proxy, graded master, and social variants.
4. Run highly parallel color and selection jobs locally first, with optional remote workers later.
5. Use VLMs to score moments, continuity, emotion, brand fit, and social format suitability.
6. Produce editable intermediate assets plus final reels, carousels, and photo sets.

## Business viability

### Initial positioning

"Drop a shoot. Get organized backups, cinematic graded selects, and social-ready drafts before you
finish charging your batteries."

### Differentiators

- Safety-first ingest with checksum verification and no default card deletion.
- Native Mac workstation performance for large shoots and external SSD workflows.
- iPhone companion for review, posting prep, and shoot intake checks.
- Editable outputs rather than black-box final-only generations.
- Taste profiles that learn a photographer's look and client categories.

### Packaging ideas

- Personal Pro: local-only workflow, one Mac, unlimited projects.
- Studio: shared presets, editor handoff packages, team review, faster batch queues.
- Compute add-on: cloud burst workers for huge video projects.

## Near-term product slices

1. Ingest planner and verifier: safe copies, backups, dedupe, folder structure.
2. Shoot graph: connect originals, proxies, grades, selects, and exports.
3. Social planner: turn a brief into reels, carousel, and photo-post jobs.
4. Color recipe engine: apply LUTs, camera transforms, and look profiles consistently.
5. VLM selection loop: rank moments and images, generate draft sequences, iterate.

## Non-goals for now

- Automatic source deletion without verified primary and backup copies.
- Replacing professional color science with text prompts alone.
- Building a cloud-only product that makes large local media uploads mandatory.
