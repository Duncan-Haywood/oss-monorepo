---
kind: polish
date: 2026-11-15
---
# Polish 2026-11-15: false "needs JavaScript" notice on 79 pages; ShootFlow RAW support page

**Why.** `surface-budget.mjs --for` over the flagships showed `photo-editing` (ShootFlow) as the
only flagship with no marketing surface, and its index a wall of text. Reading its built page showed
the "This tool needs JavaScript to calculate" `<noscript>` bar on a page with no script and no field.

## Measured (full local build, `platform/pages/dist`)

- 2,335 built pages carried `NOSCRIPT_NOTICE`. With the site's own controls ignored (the
  `pf-embed-offer` details box from `embed.mjs`, the `pfs-search` form from `site-nav.mjs`),
  79 no longer qualify: compare/ 46, c/ 22, about, updates, queue, guides, ai-engineering-academy,
  self-hosted-saas-stack, photo-editing, photos-import-tools, quick-pick-survey, vendor-watch,
  garmin-world-traveler-watchface. 2,256 keep it. Method: strip the notice from each built page and
  rerun `addNoscriptNotice` (ten-line script; rewrite it from this line).
- `ventures/photo-editing/llms.txt` line 5 said "convert other RAW formats with Adobe DNG Converter
  first", false since 2026-11-14 (ten formats read directly). Fixed.

## Changed

- `platform/pages/build.mjs`: `SITE_OWNED_CONTROLS_RE`, removed before the control test in
  `addNoscriptNotice`. Test added in `noscript-notice.test.mjs`.
- `ventures/photo-editing/site/camera-raw-formats.html`: question-titled guide, answer-first lede
  with as-of date and source link, per-format table (stacks to labelled rows under 640 px), FAQ,
  dark mode, trademark and no-warranty disclaimer. Linked from the index; llms.txt points at it.
  Figures from README sections and `eval/*-libraw-*.jsonl` row counts (NEF 18 files/16 bodies,
  RAF 10 files/9 bodies, RW2 4+12+6 bodies, 846.4 M sensels).

## Still weakest, and what I would do next

1. **ShootFlow's index "What exists today" list** is one ~700-word bullet the deepen runs append to.
   Split it into short cards (ingest, cull, develop, lens, pipeline) linking to the guide; coordinate
   with the open deepen PR (#16306 at the time) since those runs edit the same lines.
2. **The embed offer appears on pages that are not tools** (ShootFlow, the Garmin face,
   self-hosted-saas-stack): "Embed this tool" on a docs page. `embed.mjs` could skip pages with no
   control of their own, using the same test.
3. Carried over: `.pager` defined twice in the writing STYLE; research index card ledes; topic-page
   titles four lines on phones; the ticker's third line at 320 px.

## After (rebuilt site)

Full rebuild with the change: 2,256 pages carry the notice (predicted 2,256); photo-editing,
compare/jobber and the new guide carry none; `check.mjs`: 10,268 pages, no dead links. The guide at
390 px: scrollWidth 390 (no sideways scroll), light and dark
(`img/polish-2026-11-15-raw-formats-phone.png`, `-phone-dark.png`, `-desktop.png`).
