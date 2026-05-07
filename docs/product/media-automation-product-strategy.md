# Media Automation Product Strategy

## Positioning

The product helps photographers and videographers turn large shoots into organized originals, color-graded intermediates, and social-ready reels/carousels with far less manual coordination. It competes less with professional editors and more with the file-management drag, queue setup, repetitive first-pass grading, and social repackaging work that surrounds editing.

## Ideal customer

- High-volume shooters who deliver social content quickly after events.
- Solo creators who cannot afford a dedicated editor for every shoot.
- Small studios with editors who need cleaner handoffs and more variants per job.
- Travel, wedding, fitness, real estate, fashion, and event teams where speed and quantity matter.

## Core wedge

Start with a trustworthy ingest and organization assistant:

1. Detect cards, drives, and existing shoot folders.
2. Copy media safely to a chosen library or SSD.
3. Verify checksums and preserve a manifest.
4. Group media into a repeatable structure that downstream AI and human editors can use.

This wedge is useful before advanced AI works perfectly. It also earns permission to touch high-value originals by proving the product is careful.

## Product principles

- **Never risk originals.** Copy-only ingest, checksum verification, audit manifests, and no source deletion by default.
- **Human-overridable automation.** AI should propose grades, culls, storylines, and timelines; users must be able to inspect and override.
- **Batch-first UX.** Every flow should work for 10 files and 50,000 files without changing mental models.
- **Quality before novelty.** Cinematic outputs must protect skin tones, avoid overcooked LUTs, and keep shot-to-shot consistency.
- **Editor-friendly outputs.** Export intermediates that work with Lightroom, Capture One, DaVinci Resolve, Final Cut Pro, and Premiere instead of trapping users.

## Business viability hypotheses

1. File-management trust is the adoption gate; creators will not let AI grade originals until ingest feels safer than manual copying.
2. The strongest paid wedge is "same-day social pack": reels, carousel candidates, captions, cover frames, and graded selects within minutes of ingest.
3. Studios may pay for throughput and consistency even if they keep human editors for final polish.
4. A native Mac app is the best initial buyer surface because high-volume media already lives on cards and SSDs; iPhone can be a capture review, approval, and quick-post companion.
5. Local-first processing with optional cloud/vLLM bursts is easier to sell than uploading every original by default.

## High-level roadmap

### Foundation: ingest and organization

- Safe copy with checksums and manifests.
- Drive/card detection and import sessions.
- Library structure, shoot metadata, and storage health checks.
- Duplicate detection and relink support for older shoots.

### Intelligence: culling and grading

- EXIF-aware grouping and exposure analysis.
- Vision-language moment scoring.
- Reference-look matching and camera-profile-aware color transforms.
- Batch grading with per-scene consistency and manual review.

### Delivery: social packages

- Reel storyboards, beat matching, and cover-frame selection.
- Carousel ordering, crop variants, and export presets.
- Caption, hook, and hashtag drafts.
- Export bundles for Instagram, client review, and editor handoff.

### Collaboration and monetization

- Editor handoff packages with manifests and previews.
- Preset/style marketplace or photographer-specific style profiles.
- Team libraries, approvals, and usage analytics.

## Key risks

- Data loss or perceived data-loss risk can kill trust immediately.
- "AI cinematic" outputs can look generic unless the product learns user style and protects technical quality.
- Video rendering at scale can become expensive without local acceleration, caching, and queue controls.
- Instagram automation has platform-policy risk; exports should be ready-to-post before any direct posting integration is considered.

## Current implementation status

The initial codebase now starts with a tested ingest core. Future agents should build upward from the manifest contract rather than creating disconnected editing scripts.
