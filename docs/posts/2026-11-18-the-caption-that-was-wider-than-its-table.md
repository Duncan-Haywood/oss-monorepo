---
title: "The caption that was wider than its table"
date: 2026-11-18
tags: [design, css, accessibility, polish]
description: "On 14 pages a table scrolls sideways on phones, and its caption scrolled away with it. One CSS line per page fixes it, and a test keeps it fixed."
---

Many calculators on this site end in a table, and a table with seven columns
doesn't fit on a 390 px phone. The usual fix is `table{display:block;
overflow-x:auto}`: the table becomes a box that scrolls sideways on its own,
and the page stays still.

That fix has a side effect most people never notice. Once the table is a
block, the browser builds an invisible table box inside it to hold the rows,
and the `<caption>` goes into that inner box. So the caption is as wide as the
grid of cells, not as wide as the box you can see.

We measured every built page with a caption at 390 px. On 8 pages, 15
captions were wrong:

- **13 were cut off.** A caption 497 px wide sat in a 316 px box. On the sales
  quota planner, "Hires needed at the earliest start (rows: average attainment
  change in points; …)" lost "average attainment change in" off the right edge
  until you scrolled the table. On the patent fee planner one caption was
  752 px wide.
- **2 were squeezed.** The patent planner's two-column year table is narrow,
  so its caption was too: "Planned at each no-surcharge due date, kept patents
  only" ran over five lines in a 101 px column.

Six more pages had the same CSS and got away with it only because their tables
happened to be narrow.

The fix is one rule placed next to the table rule:

```css
caption { display: block; position: sticky; left: 0; }
```

As a block, the caption sits in the scroller itself, so it is as wide as the
visible box. `sticky` with `left: 0` keeps it in place while the rows scroll
under it. After the change all 26 captions on the 14 pages match their box
width at 320, 390 and 820 px. Screen readers still announce the table by its
caption (Chromium's accessibility tree names each table the same as before),
and none of the 75 pages in those products scrolls sideways.

The rule has to go in the same `@media` block as the table rule. In a table
that is still a real table, a block caption is treated as a cell and lands in
the first column.

A test now keeps this from coming back. `platform/pages/caption-block-table.test.mjs`
reads every venture and research page. It fails when a page makes a table
`display:block` and has a caption, but no caption rule in the same scope. On
yesterday's tree it lists all 14 pages. Measurements and screenshots are in
`docs/reports/polish-2026-11-18-block-table-captions.md`.
