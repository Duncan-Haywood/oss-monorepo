---
kind: polish
date: 2026-11-13
tagged: auto
---
# Polish 2026-11-13: the last four intro link walls

**Why.** Item 3 of "Still weakest" in `polish-2026-11-13-bookkeeper-guides.md`: the pages left in
`KNOWN` of `platform/pages/intro-links.test.mjs` (league-schedule-generator 28 links in one header
paragraph, shift-roster-builder 21, state-residency-day-counter 10, 3pl-quote-normalizer 10).
Open PR #15389 changes shift-roster-builder but not its `index.html`, so no conflict.

## What changed

- Each header paragraph keeps its non-link sentences (audience line; the residency and roster
  disclaimers stay first) and is followed by `<nav class="jump" aria-label="Guides">` with three
  links and `#guides`.
- A new `<section class="card" id="guides">` before "Common questions" carries every link that was
  in the paragraph (script asserted the sets match). League: four groups (29 links; adds
  `season-pack-for-league-organisers.html`, in the sitemap but previously unlinked from the tool,
  labelled as a planned paid extra). Shift roster: four groups (21). Residency and 3PL: one list.
- `.jump` / `.guide-list` CSS copied into each page's own `<style>`, in that page's colours.
- `intro-links.test.mjs`: `KNOWN` is now `{}`.

## Measured

Source pages (before from `git show HEAD:`, after from the tree), served by a Node static server,
pre-installed Chromium, reduced motion, third-party requests blocked, 300 ms after `load`. First
visible input/select/textarea document y, and `<header>` height. No sideways scroll before or
after at either width.

| page | 390 first input | 390 header | 1280 first input |
|---|---|---|---|
| league-schedule-generator | 1,163 → 715 | 1,035 → 586 | 628 → 484 |
| shift-roster-builder | 1,278 → 832 | 1,109 → 664 | 699 → 555 |
| state-residency-day-counter | 824 → 757 | 685 → 618 | 496 → 458 |
| 3pl-quote-normalizer | 603 → 491 | 436 → 324 | 528 → 479 |

Tests: `intro-links.test.mjs` 3/3; each venture's full `*.test.mjs` suite and
`platform/pages/*.test.mjs` (results in the run record).

## Still weakest, and what I would do next

1. **A shared `.jump` / `.guide-list` component.** Ten pages now carry their own copy (Etsy, eBay,
   Reverb, clothing-design-studio, ai-bookkeeper, shed-designer and the four above). Each
   uses its own colours, so a chrome version needs custom properties (`--jump-fg`, `--jump-line`)
   with fallbacks. Worth one run: it also gives later pages a no-CSS way to adopt the pattern.
2. **Lower the limit.** With `KNOWN` empty, `MAX_LINKS = 8` could drop to 6; count how many pages
   sit at 7 or 8 first.
3. **Answer leads** still missing on ~31 high-intent tools
   (`polish-2026-11-13-answer-leads-etsy-garnishment.md`, item 1): economic-nexus-threshold-tracker
   and uk-sole-trader-vs-limited-company-calculator first.
4. Carried over: `#guides` on ai-bookkeeper is 1,821 px at 390; the ticker's third line at 320 px;
   `.pager` defined twice in the writing STYLE.
