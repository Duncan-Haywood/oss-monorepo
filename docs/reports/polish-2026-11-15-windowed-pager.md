---
kind: polish
topics: [design]
date: 2026-11-15
---
# Polish 2026-11-15: a windowed pager on the blog and topic pages

Track: polish/0. Picked from `polish-2026-11-15-topic-pages.md`, "Still weakest" item 3 (the blog
index's pager was 98 page-number links long). Searched open PRs for `polish` and `pager`: none.

## What was wrong

`renderPager` in `platform/pages/writing.mjs` printed every page number, so that any post was at
most two clicks from the index. With 4,900 posts at 50 a page that is 98 links: a wall of numbers
under the list on the blog index, every numbered page, and the long topic pages
(`writing/topic/tools/` has about 51).

## What changed

- `pagerWindow(n, count)` picks the first page, the last, and two either side of the current one;
  a hidden run of exactly one page shows that page instead of an ellipsis. The gap is
  `<span class="gap" aria-hidden="true">…</span>`.
- `renderPager` shows that short row, then, only when the window hides pages, every page number in a
  closed `<details class="all"><summary>All 98 pages</summary>`. The links stay in the HTML, so the
  two-click property holds for readers and crawlers; only one `aria-current` per pager (the full list
  marks the current page with `.here`, bold).
- CSS: tighter paragraph margins in the pager; the details takes its own row in the flex pager; the
  summary keeps its disclosure triangle.
- Tests (`writing.test.mjs`): window shape at the start, middle, end and near-start; a short pager has
  no details; the long one has 6 window links and 97 links in the full list.

## Measured

`node platform/pages/writing.mjs` section build, Playwright on `file://`, `#pager` element:

| | before | after |
|---|---|---|
| Visible links in the pager, index (390 and 1,280 px) | 98 | 4 |
| Visible links, `page/50/` | 99 | 8 |
| Pager height at 390 px, `page/50/` | 350 px | 144 px |
| Pager height at 1,280 px, `page/50/` | 237 px | 96 px |
| Sideways scroll from the pager, opened, at 390 px | n/a | none |

Screenshots: `docs/reports/img/polish-pager-before-390.png`, `polish-pager-after-390.png`,
`polish-pager-open-390.png`.

Note for the next run: opening a full-build page from `file://` at 390 px shows the header band
(`.pfs-bar`) 438 px wide; that is the band without its served CSS, not a live defect. Measure
sideways scroll over HTTP (`python3 -m http.server` in `dist`) or with `browser_checks.py`.

## Still weakest, and what I would do next

1. **Tools and projects is still about half the blog** (carried over): a short "by project" index at
   the top of `writing/topic/tools/` would beat a 51-page date list.
2. **The podcast index has no edge fade on its chip row** (carried over).
3. **`cardName` and `toolName` disagree** between hub cards and trails (carried over,
   `polish-2026-11-15-related-names.md`).
