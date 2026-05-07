# Continuation Notes

This file is for the next automation run. Keep it short, current, and biased toward
what should happen next.

## Current branch state

- Branch: `cursor/media-content-automation-2c66`
- Core package: `src/shootflow`
- Verification command: `PYTHONPATH=src python3 -m unittest discover -s tests && python3 -m compileall -q src tests`

## Shipped in this iteration

1. Safe ingest foundation:
   - Copies supported media into `{shoot_date}_{shoot_slug}/originals`.
   - Writes `ingest_manifest.json`.
   - Verifies SHA-256 and byte size after copy.
   - Rejects symlinked media sources.
   - Rejects symlinked path ancestors and broken symlink destinations.
   - Never deletes source files.
   - Never overwrites a different destination file with the same camera filename.
2. Storage candidate ranking:
   - Camera-card-like removable volumes are source candidates requiring review.
   - Large writable volumes can be automatic destinations.
   - Read-only unknown volumes require review and cannot be destinations.
3. Instagram deliverable planning:
   - Plans first-cut reels from ranked video assets within a duration limit.
   - Plans scene-varied carousels capped to Instagram limits.
   - Plans ranked photo sets for handoff/review.
4. Product/business/legal docs:
   - `docs/PRODUCT_STRATEGY.md`
   - `docs/DESIGN_DECISIONS.md`
   - `docs/TERMS_AND_CONDITIONS_DRAFT.md`

## Safety invariants to preserve

- Do not delete source media.
- Do not overwrite existing destination bytes unless checksums match.
- Treat camera cards as import sources, not workspaces or destinations.
- Require human review for uncertain destructive or filesystem-sensitive actions.
- Prefer manifests and immutable artifacts over hidden mutable state.

## Recommended next implementation slice

Add a manifest-backed production catalog and VLM analysis layer:

1. Load `ingest_manifest.json` from the expected shoot folder only.
2. Reject catalog items where `source_deleted` is true.
3. Re-check destination file existence, byte size, and SHA-256 before exposing an asset.
4. Convert verified photo/video ingest items into `deliverables.MediaAsset`.
5. Load per-asset VLM analysis JSON outputs and reject analysis for assets not in the verified catalog.
6. Add tests before code for escaped paths, stale checksums, unsupported media, and unknown analysis assets.

## Known residual risks

- Concurrent imports into the same shoot folder are not yet race-safe. Add file
  locks or per-import staging directories before allowing multiple workers to
  write into the same destination at once.
- The current package plans deliverables but does not render media, call VLMs,
  or build macOS/iOS UI yet.

## Product direction notes

- The first wedge should feel like an assistant editor for ingest, safety, and first
  IG content drafts, not an opaque fully autonomous editor.
- Keep professional trust high: visible manifests, review queues, reversible output
  folders, and clear "no deletion" language are differentiators.
- The app path should remain local-first on macOS, with iPhone as companion capture,
  review, and posting assistance.
