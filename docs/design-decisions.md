# Design decisions

## Product thesis

Shotflow is aimed at photographers and videographers who want a faster path from
shoot dump to publishable Instagram output without giving up quality control.
The best wedge is not "one-click magic" alone. It is reliable shoot intake,
organization, previews, grading candidates, and draft reels/carousels that a
creator can approve or refine quickly.

## Architecture direction

1. **Local-first ingest and media library**
   - Media starts on SD cards, cameras, phones, SSDs, or local folders.
   - The app creates a manifest and copies into an organized library.
   - Source deletion is never automatic. Future "card clear" flows should require
     explicit confirmation after checksum verification and at least one separate
     backup target.

2. **Deterministic core before AI**
   - File detection, copy, hash verification, naming, and manifest generation
     should be deterministic and heavily tested.
   - AI agents should propose edits, selects, captions, and timelines from a
     trustworthy manifest instead of scanning arbitrary folders repeatedly.

3. **Parallel media pipeline**
   - Each asset should be independently processable after ingest.
   - Future work should model jobs as: probe metadata -> generate proxy/thumbnail
     -> classify/select -> color candidate -> render/export -> quality check.
   - The manifest should become the handoff contract between stages so tens of
     thousands of assets can run across local workers, external GPUs, or cloud
     queues.

4. **Human approval loop**
   - The product should generate intermediate graded photos/videos plus draft
     reels and carousels.
   - Users should be able to lock favorites, reject bad AI choices, and request
     another pass without losing prior outputs.

5. **Legal and trust posture**
   - Treat media as irreplaceable customer property.
   - Keep indemnification, warranty disclaimers, and user responsibility terms in
     plain language, but do not let legal terms substitute for safer defaults.

## Current implementation slice

The current code provides a Python core that:

- classifies supported raw photos, photos, videos, and camera logs;
- creates a non-destructive ingest plan grouped by shoot and media kind;
- avoids destination overwrites with fast metadata fingerprint suffixes;
- serializes a JSON manifest with `delete_source: false`; and
- executes verified copies without deleting sources.

Use this as the seed for a future macOS/iOS app, not as the final app surface.
