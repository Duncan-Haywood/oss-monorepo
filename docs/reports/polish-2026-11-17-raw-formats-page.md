---
kind: polish
topics: [design, seo]
date: 2026-11-17
---
# Polish 2026-11-17: ShootFlow's camera raw page on the main page's design

Track: polish/0. Picked item 2 of "Still weakest" in `polish-2026-11-16-shootflow-page.md`
(`camera-raw-formats.html` still uses the old plain styles) and item 4 of the same report (flow
arrows on a phone touch the next card). Open PRs checked (`polish in:title`: #11730, #14012,
#12397; `camera-raw`: none). None touch `ventures/photo-editing/`.

## Measured before and after (Playwright, the raw files, 390 and 1,280 px)

| | before | after |
|---|---|---|
| Table caption at 390 px | about 80 px wide, 19 lines | full width, 4 lines (now a `p.note` with `aria-describedby`) |
| Sideways scroll, 390 px (both pages, light and dark) | none | none |
| Page height, raw page, 390 / 1,280 px | 8,113 / 4,230 px | 9,003 / 4,921 px (row cards and a facts row) |
| Flow arrow vs next card, index at 390 px | arrow overlaps the card border | arrow centred in a 1.1 rem gap |
| Lowest contrast of new pairs (light and dark) | n/a | 5.39:1 (`--ok` on `--ok-soft`, light) |

Screenshots were taken locally and looked at, not committed (the page is text and tables).

## What changed

- `ventures/photo-editing/site/camera-raw-formats.html`: index.html's tokens (`--accent-soft`,
  dark values), eyebrow, three CTAs, a three-fact row, chips as jump links (`#f-<format>`, rows
  now carry ids, `:target` highlights), the table styled like index.html's, row cards under
  760 px, a commented command block, `aria-labelledby` on every section. Smooth scroll is off
  under `prefers-reduced-motion`.
- The answer now names RWL (the chip row already listed it, so the page said "eleven" and showed
  twelve chips). No measured claim was edited; the table cells, FAQ and disclaimer are the same text.
- `ventures/photo-editing/site/index.html`: the phone `.flow` gap went from .5 to 1.1 rem and the
  arrow from `bottom:-.42rem` to `-.88rem`.

## Still weakest, and what I would do next

1. **No real picture on either ShootFlow page** (carried from `polish-2026-11-16-shootflow-page.md`,
   item 1). A cull report still or a developed raw frame from a CC0 sample would show the tool.
2. **The raw page's phone height went up about 900 px.** The row cards add padding. If it reads long,
   collapse the "Still refused" text behind a `<details>` on phones only.
3. **The llms.txt "Limits" bullet** is still one long paragraph (same report, item 3).
4. **Other venture pages with a `<caption>` inside a table that goes `display:block` on phones** may
   have the same crushed caption. A check in `platform/pages/` could find `caption` plus a
   `table{display:block}` rule in the same file; I did not write it.
