---
kind: polish
topics: [design, seo, aeo]
date: 2026-11-16
---
# Polish 2026-11-16: ShootFlow's landing page rebuilt around what it does

Track: polish/0. Picked item 2 of "Still weakest" in `polish-2026-11-16-header-row.md`
("ShootFlow (flagship 7) at 1,280 px is a text-wall docs page", also
`polish-2026-11-15-footer-lead.md` item 3). Open PRs: none on ShootFlow when this run started.

## What changed

- `ventures/photo-editing/site/index.html` rewritten. The new hero, eyebrow and CTAs come
  first, then a three-fact row, a five-step `ol.flow` (a grid at desktop width, stacked under
  760 px, CSS arrows), four feature cards each with a `.proof` line, the README's output table,
  format chips, a "Measured / Not yet" split, the three-command block, the FAQ (one new
  question: develop raw without Lightroom), privacy, the disclaimer and the footer. Dark mode via tokens.
- The title and description now name the queries (cull, develop raw, grade, offline, Mac).
  `SoftwareApplication.operatingSystem` is now "macOS, Linux".
- `ventures/photo-editing/llms.txt`: the live-page link moved from github.io to marisstella.app.
  The summary had said "not yet on real camera files", which is stale. It now opens with a short
  first sentence (the tools topic dek clips at 320 characters), adds Leica RWL, adds a
  camera-raw-formats link and a short "Raw formats it develops" section.
- Every claim on the page is taken from the README or its eval files (LibRaw matches, 214 s to
  129 s, 6 of 6 and 0 of 99 blinks, 71 raw files with none left on the card).

## Measured

- "What exists today": 548 words → 253. Longest block 377 words → 44.
- Page height: 3,830 → 5,084 px at 1,280 and 6,884 → 9,162 px at 390. The page is longer
  because it now has the table, steps and split; the wall is gone. scrollWidth stays 390 at 390.
- FAQPage questions 5 → 6. Contrast (`contrast.mjs`, axe 4.10.2, ONLY_SLUGS=photo-editing):
  0 WCAG A/AA violations across desktop and phone, light and dark. `check.mjs`: publishable, no dead links.
- Screenshots: `img/polish-2026-11-16-shootflow-{before,after}-{390,1280}.png`.

## Still weakest, and what I would do next

1. **No real picture on the ShootFlow page.** Run `shootflow cull` on a CC0 set (the 105-photo
   blink set's sources, or raw.pixls.us) and capture the HTML report as a showcase still, with
   the licence named. Add it to `platform/pages/showcase/capture.mjs` `SHOTS`.
2. **`camera-raw-formats.html`** (the second ShootFlow page) still uses the old plain styles. It
   could share the new page's tokens, chips and table style.
3. **The llms.txt "Limits" first bullet** is a single paragraph of about 3,000 words. Splitting
   it into one bullet per format would make it liftable by assistants. That needs care, because
   every clause is a measured claim.
4. The flow arrows on a phone touch the next card's border. Give them 2 px more gap, or leave
   them out under 760 px.
