---
title: "The Excel2IDS sample asks every external door to be True, and our own download tripped the tool"
seo_title: "Where the Excel2IDS tool writes a different IDS, cell by cell"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS Model Check now lists each cell where the Excel2IDS .exe would write a different IDS or stop. First finds: the template's sample and our own download."
---

Earlier today [IDS Model Check](https://marisstella.app/ids-model-check/)
learned to read buildingSMART-community's
[Excel2IDS](https://github.com/buildingsmart-community/Excel2IDS) workbooks:
categories across the top, requirements down the side, an `X` where they
meet. Many BIM managers already turn those workbooks into IDS files with the
project's own Windows tool. If you switch readers, the useful question is
which cells in *your* workbook the two would read differently.

So the page now answers that. After you drop a workbook, a folded list gives
the row and column of each cell where the Excel2IDS tool would write a
different IDS, or stop and write nothing. The rules come from reading the
tool's Python source (commit `4eb7575`). We didn't run the tool, and none of
its code is used. Some of what it does:

- A category with no purpose stops the tool. It splits the empty cell and
  raises an error.
- A toggle typed as the text `FALSE` counts as on, because Python treats any
  non-empty text as true. Only a real boolean `FALSE` switches a column off.
- A typed `TRUE` in a value cell is written `True`. IDS booleans are `true` and
  `false`, so `True` matches nothing.
- A number in the matrix stops the tool. It calls `.strip()` on the cell, and
  only text has that.
- A `REPLACEME` row picks up a value left over from an earlier row: the
  instructions from the last `X` the tool read, possibly in another column. On a
  property row, the row's value and URI end up on an earlier property facet
  instead.
- `Prohibited` with a capital P is read as required.
- If rows or columns have been inserted, the tool reads its fixed cells anyway.

## The template's own sample

We ran the rules on the sample workbook that ships with the template. They
found no stop and one cell. In the "External doors" category, the property
`IsExternal` must equal a typed `TRUE`, so the tool writes `True`. That value
matches no door. The category is optional, so the tool's MEP IDS selects
nothing and passes quietly. IDS Model Check writes `true`. The same category
has the row the earlier write-up found, which asks every external door to be
an `IFCWALL`.

## Our own download

The bigger find was in our own code. The page can also write any IDS into the
template ("as an Excel2IDS workbook"), and its Read me sheet said the Excel2IDS
tool reads the result too. We wrote 351 workbooks from public IDS files and
buildingSMART's test files, then ran the rules on them. The tool would have
stopped on 316. Most IDS files have no `<purpose>`, so our writer left the
template's purpose row empty, and an empty purpose stops the tool.

The writer now fills that row with `General`, which is the tool's own default
name. The tool stops on none of the 351. Every specification still comes back
the same through our reader. What still differs can't be fixed inside the
workbook. The tool keeps only one exact IFC version, and 218 of the workbooks
name more than one (`IFC2X3 IFC4` in 205). The download now says this when it
applies.

## What's still unmeasured

All of this comes from reading the tool's source, not from running it. We
wrote a side-by-side script that runs the tool unchanged on the same workbooks
and compares its IDS with ours. This session's sandbox wouldn't run a script
fetched from GitHub, so that comparison is the next step for a session that's
allowed to. We also still need a workbook a BIM manager filled in for a real
project. The only public one is the sample.

The rules, the counts and the script are in
[`eval/excel2ids-tool-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/excel2ids-tool-2026-11-19.md).
The checker is free and MIT licensed, and your workbook stays in your
browser.
