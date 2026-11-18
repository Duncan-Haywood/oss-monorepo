---
kind: polish
date: 2026-11-16
---
# Polish 2026-11-16: section index pages share the site bar's column

Picked from item 2 of `polish-2026-11-16-story-cards.md` ("Still weakest"): the Stories hero and
shelves sat in a 960 px column centred in the 1,120 px header, and the research index had its own
offset. Measured, it was wider than two pages: four distinct left edges across five section pages.

## Measured (Playwright, built site, h1 left edge vs the `.pfs-bar` content edge)

| page | 1,280 before | 1,280 after | 1,440 before | 1,440 after | 390 before/after |
|---|---|---|---|---|---|
| bar (brand) | 96 | 96 | 176 | 176 | 16 |
| `/` | 96 | 96 | 176 | 176 | 16 |
| `/stories/` | 176 | 96 | 256 | 176 | 16 |
| `/updates/` | 176 | 96 | 256 | 176 | 16 |
| `/queue/` | 176 | 96 | 256 | 176 | 16 |
| `/research/` | 74 | 96 | 154 | 176 | 16 |
| `/writing/` (not changed) | 296 | 296 | 376 | 376 | 16 |

`scrollWidth` equals the viewport on every page at all three widths, before and after.

Screenshots: `img/polish-2026-11-16-index-column-{stories,research}-{before,after}-d.png` (1,280 px).

## What changed

- `stories.mjs`, `updates.mjs`, `queue.mjs`: `.wrap` 960 → 1,120 px (gutter 16 unchanged).
- `research/_homepage/template.html`: `.wrap` 1,180 px / 24 px gutter → 1,120 / 16. Only the index
  template had 1,180; `project.html` and `topic.html` don't define it.
- `updates.mjs`, `queue.mjs`: `main :is(p, li) { max-width:78ch }`. At 1,120 the queue's cards
  and intro paragraphs measured 1,088 px (~130 characters). Hero ledes keep their own 68ch cap
  (`.pf-hero .lede`, higher specificity).
- `updates.mjs`: `.tiles` minimum 250 → 300 px so the six weekly tiles fall 3 + 3, not 4 + 2.
- New `index-column.test.mjs`: each of the four columns must equal `.pfs-bar`'s max-width and side
  padding in `site-nav.mjs`. Fails 4 of 4 on the old code.

## Deliberately left

- **`/writing/` and blog posts** keep the 720 px centred reading column (`writing.mjs` STYLE is
  shared with every post). Aligning only the index left inside 1,120 would leave a lopsided
  ~400 px gap at 1,280. If a later run wants the blog index aligned, give it a two-column layout
  (filters in a side rail at ≥1,024 px) rather than a left-pushed 720 column.

## Still weakest, and what I would do next

1. **The hub's right half at 1,280 px is empty starfield** beside the hero (carried over). A real
   flagship screenshot there would show the product.
2. **Other site-owned pages with their own `.wrap`** (`engineering.mjs` already 1,120; category
   pages, Compare, Guides, About in `build.mjs`): run the same h1-vs-bar measurement across them
   and add any that should follow the rule to the test's list.
3. **Stories shelves at 1,120** show three cards a row, six newest per shelf (two full rows), but
   the shelf's description paragraph stops at 68ch, leaving the right ~40% of each shelf header
   empty. A shelf cover image or the "Listen" row (story-cards report, item 1) could use it.
4. Carried over: `relatedTools` on Vendor Watch; "Need this tool to do more?" on ShootFlow docs.
