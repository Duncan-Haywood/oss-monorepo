# Photo Editing Automation

This repository is the start of a Mac + iPhone workflow for photographers and
videographers who want to drop in SD card footage, RAWs, JPEGs, LUTs, logs, and
old footage, then get organized originals, intermediate graded assets, and
Instagram-ready reels, carousels, and photo posts with far less manual work.

The product direction is intentionally safety-first:

- Never delete source media automatically.
- Treat "move" as copy, verify, and human review.
- Keep deterministic manifests for every ingest.
- Build modular planning logic before wiring expensive GPU/VLM workers.
- Optimize for high-quality output that a working creator or editor can trust.

## Current implementation

The current codebase contains a tested TypeScript core for:

- Media file classification across common photo, video, RAW, LUT, sidecar, and
  audio formats.
- Deterministic shoot ingest plans with collision-safe destination paths.
- Copy and checksum verification operations that never include automatic source
  deletion.
- First-pass Instagram deliverable briefs for reels, carousels, and photo posts
  from graded media metadata.

## Development

```bash
npm install
npm test
npm run typecheck
```

## Product docs

- `docs/PRODUCT_STRATEGY.md` - audience, wedge, business viability, and roadmap.
- `docs/ARCHITECTURE.md` - high-quality system architecture and worker model.
- `docs/LEGAL_TERMS_DRAFT.md` - draft terms, indemnification, and media safety
  language to review with counsel before any public launch.
- `docs/CONTINUATION_NOTES.md` - handoff notes for future automation runs.