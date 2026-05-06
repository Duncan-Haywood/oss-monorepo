# MediaFlow

MediaFlow is an early personal-tool/product prototype for photographers and
videographers who want faster shoot ingest, bulk color work, and automatic
Instagram-ready reels, carousels, and photo posts.

This repository currently contains:

- A small tested Python planning core in `mediaflow/` for safe ingest and social
  output planning.
- Product and architecture notes in `docs/product/`.
- A draft indemnification and file-safety terms document in `docs/legal/`.

The product direction is native Mac + iPhone first, with a local-first pipeline
that can move media from SD cards to primary and backup storage, create
intermediate graded assets, and queue highly parallel color/video jobs.

## Verify

```bash
python3 -m unittest discover -s tests
```