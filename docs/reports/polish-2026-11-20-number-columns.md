---
kind: polish
topics: [design, typography]
date: 2026-11-20
---
# Polish 2026-11-20: figure columns in Markdown tables right-aligned, tabular digits

Not from the queue. The look-first pass (hub, ai-bookkeeper, /research/, /stories/, a blog post,
390 and 1280 px) found the post page's table the weakest corner: "Loads" header far from its
figures, amounts ending at different x. Posts are the surface most new pages are added to (most
PRs carry one), and the fix is one renderer change for every post at once. No open PR had
`polish` in its title.

## What changed

- `platform/devlog/markdown.mjs`: `columnAlign(sep)` reads GFM `:---`, `:---:`, `---:`;
  `numericColumns(rows, cols, align)` marks a column when the author wrote `---:`, or (columns
  after the first) every non-blank body cell matches `NUMERIC_CELL`. Blanks are empty, `—`, `–`,
  `-`, `n/a`. `renderTable(head, rows, align)` adds `class="num"` to the column's `th` and `td`s
  (plain and `.stack` tables).
- `platform/pages/site-nav.mjs`: `NUM_TABLE_CSS` (`th.num,td.num{text-align:right;
  font-variant-numeric:tabular-nums}`) in `renderSiteStyle()` (pf-site.css). The `.stack` phone
  card rule `table.stack td{text-align:left}` is more specific, so cards are unchanged.
- `platform/devlog/render.mjs`: the same rule in the devlog's own stylesheet (it doesn't link
  pf-site.css).
- Tests: `platform/pages/num-columns.test.mjs` (new, 5); `devlog.test.mjs` assertion updated for
  the marked column.

Counts in `docs/posts/` (script over the Markdown): 1,983 tables, 1,197 with a figure column,
3,120 such columns, 1,136 posts; 130 posts used `---:`. In the build: 1,164 post pages and
1,217 pages site-wide carry `class="num"`.

## Measured

Before = the build of main at 82dc3b455, after = the same with this change. Chromium over the 1,164
post pages with a `.num` column. "Lined up": in a plain (non-card) column whose cells all match
`^[+\-−~$]?[\d,]+(\.\d+)?%?$`, max − min of the cells' text right edges ≤ 1 px.

| Width | Lined up before | after | `.scroll` overflowing before | after | page sideways scroll |
|---|---:|---:|---:|---:|---:|
| 1280 | 953 / 2,709 | 2,699 / 2,709 | 83 | 83 | 0 → 0 |
| 390 | 287 / 1,277 | 1,274 / 1,277 | 0 | 0 | 0 → 0 |
| 320 | 292 / 1,277 | 1,274 / 1,277 | 9 | 11 | 0 → 0 |

The two new 320 px overflows: `a-1-3-factor-rate-is-not-30-percent` (4 px) and
`boards-that-fit-in-the-truck` (5 px); four existing ones grew by 4 to 8 px
(`bookkeeper-new-payee-track-record`, `permit-feeds-what-they-hold`, `trusses-for-a-small-shed`,
`two-kids-take-4400-off-a-100000-estimate`). Cause: tabular digits are wider than Inter's
proportional ones. I judged alignment worth a few px of in-box scroll at 320.

Screenshots (720 px wide, 2x): `img/polish-number-columns-{before,after}-720.png`
(`why-a-resellers-bank-statement-understates-profit`).

Suite: `node --test 'platform/pages/*.test.mjs' 'platform/devlog/*.test.mjs'`: 1,908 pass, 0 fail.

## Still weakest, and what I would do next

1. **Venture and research pages' own tables** (hand-written HTML, not Markdown) still left-align
   figures. A build-time pass over `dist/**/index.html` tables could add `.num` with the same
   test, but those pages style tables themselves; measure a sample (e.g. `/engineering/`,
   research project pages) before touching them.
2. **Bold figures** in an otherwise plain column (a total row) don't line up exactly: the
   remaining 10 of 2,709. Accepted; `font-weight` changes digit width even with tabular-nums.
3. **320 px overflows** (11 tables): the four-column figure tables listed in
   `polish-2026-11-19-phone-table-cells.md` item 1. A `@media (max-width:360px)` cell padding of
   4 px on `.num` cells would likely bring the two new ones back; measure.
4. Carried over: `polish-2026-11-20-long-eyebrows.md` items 1 and 2.
