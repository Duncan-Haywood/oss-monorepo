---
kind: analysis
subjects: [pages]
topics: [accessibility]
date: 2026-11-19
---
# Print legibility: what `paper.mjs` found and what is left

Explore run, 2026-11-19. Tool: `platform/pages/paper.mjs` (model + sweep),
`paper.test.mjs` (model pinned to Chromium's measured PDF output). Fix:
`PAPER_INK_JS`, shipped in `pf-site.js` through `renderChromeModule`.

## Numbers (ventures/<slug>/index.html, 1,391 pages, Chromium print emulation)

- Before: 1,079 pages / 4,797 text runs under 4.5:1 (3:1 large) on paper;
  978 of those pages were button labels only; 101 had result text fading.
- After (`--with-fix`): 5 pages / 15 runs; 34 runs on a kept gradient unjudged.
- Print-button pages only (290): 6 with findings before.

## Left open (screen contrast too, so the fix rightly skips them)

- `reverb-fee-calculator`: `.negative` (#ffb6a6, meant for the dark panel)
  reused on table rows on the light page, about 1.7:1 on screen too.
- `dental-ppo-writeoff-calculator`: `thead th` #4d5b6c inside the dark panel.
- `testimonial-keeper` (stars #d97706, 3.2:1), `cash-application-matcher`
  eyebrow (4.39:1), `texas-electricity-plan-checker` legend swatch glyph.

## Caveats for the next run

- The sweep runs against sources served from `ventures/`, injecting
  `PAPER_INK_JS` itself for `--with-fix`; the built site loads it from
  `pf-site.js`. A run against a build (`BASE_URL=` the dist server) checks
  the real thing.
- `page.pdf()` does not fire `beforeprint`; dispatch it first (the sweep does).
- Only Chromium's darkening rule is modelled.
