---
kind: polish
topics: [seo]
date: 2026-11-24
---
# Polish 2026-11-24: catalogue-wide title ratchet, ai-bookkeeper titles

Picked items 1 and 2 of "Still weakest" in
`polish-2026-11-24-flagship-titles.md`.

## What changed

- `platform/pages/title-length.mjs` + `.test.mjs` + `title-length-baseline.json`:
  every venture page (`ventures/**/*.html` with an `<html` tag, not under
  `node_modules`/`.next`) over 70 characters must be on the baseline, and a
  listed page that now fits must come off (`--write`). Same count as
  `check_title_meta.py` (1,088 both). Runs in `portfolio-pages.yml`'s
  "Test the site builder" step, which PRs touching `ventures/**` trigger.
- 17 ai-bookkeeper guide titles cut to 57 to 69 characters, facts only from the
  old titles; `h1`, `og:title`, descriptions untouched.
- Post: `docs/posts/2026-11-24-title-ratchet.md`.

## Measured

- `check_title_meta.py`: long-title 1,105 → 1,088 (4,233 pages).
- `node --test platform/pages/title-length.test.mjs`: 4 pass, ~0.3 s.

## Still weakest, and what I would do next

1. **league-schedule-generator (14), ebay-fee-calculator (8),
   babysitting-business-kit (7)**: next largest. Fix, then
   `node platform/pages/title-length.mjs --write` (the per-venture
   `title-length.test.mjs` copies are no longer needed).
2. The 1,088 are spread thin (most ventures have 1 to 5): a batch run over
   the many single-title ventures would cut the count fastest.
3. Carried over: og:title on einvoice country guides; `writing/` and
   `research/` mid-title ellipses; venture-fold `--write-baseline` on a full
   build; 17 pages with no meta description (5 in photo-editing).
