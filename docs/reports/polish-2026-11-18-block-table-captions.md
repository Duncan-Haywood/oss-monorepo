# Polish 2026-11-18: table captions inside phone scrollers

Picked item 4 of "Still weakest" in `polish-2026-11-17-raw-formats-page.md`: other venture pages
with a `<caption>` in a table that goes `display:block` on phones. It was broader than "crushed".

## What was wrong

When a `<table>` is set to `display:block` so it scrolls sideways on a phone, the browser wraps
its rows in an anonymous table box and puts the caption in that box. The caption is then as wide
as the **grid**, not as the visible scroller. A wide grid pushes the caption's text past the right
edge, where it stays hidden until the reader scrolls the table. A narrow grid squeezes it.

There were two sources: the hand-pasted `mobile-overflow-guard` block on 5 pages (an unconditional
`table{display:block}`), and page-local rules on 9 more (`.result table{display:block}`,
`@media (max-width:700px|480px){table{display:block}}`).

## Measured (Playwright, the local build, caption width vs. its table's box)

At 390 px, before:

| page | captions | caption vs box |
|---|---|---|
| patent-maintenance-fee-planner | 2 | 752 in 316 (cut off); **101 in 316** (9 words over 5 lines) |
| sales-quota-capacity-planner | 4 | 587, 497, 526 in 316 (cut off); 261 in 316 |
| 3pl-quote-normalizer (index, inbound) | 5 | 378 to 522 in 312 (cut off) |
| referral-keeper | 1 | 431 in 288 |
| 3pl-invoice-audit-checker | 1 | 457 in 316 |
| prop-firm-challenge-calculator | 1 | 462 in 316 |
| tiktok-shop-fee-calculator | 1 | 363 in 312 (also 363 in 331 at 820 px) |

That is 15 captions on 8 pages: 13 cut off by 51 to 436 px, and 2 squeezed. Six more pages
(amazon-fba-calculator, owner-operator-cpm-calculator, two stockx and two where-to-sell
comparison pages, 11 captions) had the same rule but fitted that day only because their grids
were narrow. One (reverb-vs-ebay's second caption) was already 24 px short of its box.

After `caption{display:block;position:sticky;left:0}` in the same scope as the table rule:
**all 26 captions equal their table's box width at 320, 390 and 820 px.** The caption also stays in
view while the table is scrolled sideways (checked on prop-firm-challenge-calculator with
`scrollLeft=200`).

- Accessibility: the CDP accessibility tree gives the same `table` names (from the caption) before
  and after, on all 8 broken pages.
- Sideways scroll: `WIDTH=320,360 node platform/pages/sideways.mjs <the 11 ventures>`: 75 pages, none
  scroll sideways.
- Screenshots (390 px, 2x): `img/block-table-caption-sales-before.png` /
  `-after.png` ("average attainment change in" was hidden), and
  `img/block-table-caption-patent-before.png` / `-after.png`.

The dist copies were patched with the same edits to measure, not rebuilt. The build copies the
`<style>` text through unchanged, so the result is the same, but the next full build is the real
proof.

## The check

`platform/pages/caption-block-table.test.mjs` (static, ~0.4 s): any `ventures/` or `research/`
HTML page with a `<caption>` and a rule that makes a `table` `display:block` must have a
`caption{display:block}` in the same `@media` scope, or an unconditional one. On main it lists
all 14 pages. With this PR it passes. The scope matters: in a table that is still
`display:table`, a block caption becomes an anonymous cell in the first column.

The guard block itself was left alone. `overflow-guard-variants.test.mjs` allows only its two
known forms, so the caption rule is a separate `<style>/* caption-in-block-table */` after it.

## Still weakest, and what I would do next

1. **The test reads only inline `<style>`.** A venture that makes tables block-level in a linked
   `style.css` or a `../shared/*.css` is not seen. None was found by grep today
   (`grep -rlE 'table *\{[^}]*display: *block' --include=*.css`). Extend it if one appears.
2. **Captions built by script** (`shed-designer/costview.mjs` writes one) are covered only when the
   page's HTML also contains a literal `<caption`.
3. **changepoint-detector/watch-a-metric-for-changes.html has an 85-word caption** (11 lines at
   390 px). It reads as a paragraph. The table is fine, but the text belongs in a `p.note` with
   `aria-describedby`, like the raw-formats fix.
4. **amazon-fba-calculator's result tables are 377 px wide at 320 px** (both before and after this
   change). `sideways.mjs` says the page does not scroll sideways, so they sit in a scroller, but
   I did not look closer.
