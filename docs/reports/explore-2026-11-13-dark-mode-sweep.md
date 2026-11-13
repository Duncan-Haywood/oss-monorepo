---
kind: explore
topics: [accessibility, design, testing]
date: 2026-11-13
---
# Explore 2026-11-13: first whole-site dark-mode contrast sample

Picks up "Next 1" and part of "Next 2" from `polish-2026-11-11-index-contrast-dark-mode.md`.

## Tool changes (`platform/pages/contrast.mjs`)

- `SAMPLE_EVERY=N` (+ `SAMPLE_OFFSET`) checks every Nth page of the sorted list. `SKIP_PREFIXES=writing/` drops trees that share one template. Both print a `SAMPLED:` / `SKIP_PREFIXES=` line, so a sampled run never reads as a full one.
- `JSON_OUT=file` writes every finding as JSON, for counting families and diffing runs.
- **Canvas fix.** When `<html>` and `<body>` are both transparent, the page is painted with the computed `Canvas` colour before axe runs. axe otherwise assumes white. That produced 230 false failures on 16 dark-mode checker pages and hid 26 real ones (android-data-safety-check's `#555` footer passed against white). A page with no `color-scheme` keeps the white canvas, so light-only pages are unchanged.

## Numbers

Dark mode, `SAMPLE_EVERY=8 SKIP_PREFIXES=writing/`: 626 of 5,007 pages × 2 widths, about 12 minutes.

| | nodes | pages |
|---|---|---|
| before any change | 609 | 183 |
| after the canvas fix and research button fix | 133 | 38 |
| of which the sticky-panel false positive | 68 | 23 |

The touched slugs (android-data-safety-check, clothing-design-studio, cra-evidence-desk, custom-development, feedback, merchant-feed-check, permit-packet-preflight) were rerun in both schemes, and a 1-in-10 research sample was rerun in both schemes. Results are in this PR's run record `notes`.

## Fixed

research/_homepage project.html and topic.html (`.links a.primary` takes `var(--bg)`, in-text links underlined), research/civ-levers app, research/marriage-divorce-evidence app (light tokens), build.mjs `FEEDBACK_STYLE` and custom-dev pressed buttons, android-data-safety-check (dark ink block), cra-evidence-desk, permit-packet-preflight (dark link colour), clothing-design-studio eprfr/eutax/salestax/prices (aria-labels on JS-built row inputs), merchant-feed-check (focusable `pre`).

## Open, for the next run

1. **Sticky-panel false positive**: 68 nodes, 20 bid calculators. The `.result` panel is taller than 900 px, and axe resolves the colour past its edge. The fix belongs in the layout, either `max-height: calc(100vh - X); overflow:auto` on the stuck panel or unsticking it when it is taller than the viewport. That is a real usability point as well: a short window can't see the panel's bottom.
2. **clothing-design-studio/bom.html** `.pf-table-scroll` at 390 px: `SCROLL_A11Y_SCRIPT` (platform/pages/reflow.mjs) adds the tab stop from a measured scrollWidth when it collects. The table is written later, and the scrolling box gets no `tabindex`. It needs a re-measure after the result renders, perhaps a ResizeObserver on the boxes. This is shared code, so it fixes every calculator that renders tables late.
3. The other 7 sample offsets (`SAMPLE_OFFSET=1..7`) have not been read. Light mode across the whole site has not been sampled either.
