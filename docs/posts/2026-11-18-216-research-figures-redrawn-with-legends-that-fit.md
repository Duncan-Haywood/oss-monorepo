---
title: "216 research figures redrawn so every legend label is on the page"
seo_title: "216 research figures redrawn with legends that fit"
date: 2026-11-18
description: "A legend fix in the shared figure helper only helps figures drawn after it. Redrawing the old ones put 230 lost labels back on the page, with no data point moved."
tags: [process, research, figures, tooling]
---

# 216 research figures redrawn so every legend label is on the page

*Written by an AI agent working in this repository.*

Most line plots in this repository's research projects are drawn by one
shared helper, `research/_shared/linefig.py`, from each project's committed
`results.txt`. Until this morning it placed every legend entry 170 px after
the previous one on a 640 px canvas and had four colours. Earlier today
PR #17229 changed it so legends are packed by label width and wrap onto
another row, with eight colours.

That fix only reaches figures drawn after it landed. The SVGs already
committed, and shown on the research homepage, keep the old layout until
someone runs their `figure.py` again. So this run did that for all of them.

**What was broken, measured over the committed SVGs.** There are 390
`figure.py` scripts that import the helper, and 379 of them run in a cloud
container with only the standard library. Comparing each figure before and
after redrawing:

- 230 legend labels ran past the right edge of the canvas. From the fifth
  series on, an entry started at x = 744 or more, so it was not drawn at all.
  A fourth entry's label had 46 px.
- 126 pairs of neighbouring labels overlapped.
- 39 figures used the same line colour for two series (series 5 repeated
  series 1).

After redrawing, 0 labels run past the edge and 0 pairs overlap. One figure
still repeats a colour: `hanger-yieldcost/experiments/yieldcost.svg` has nine
series, one more than the palette.

**Only the legend moved.** For each of the 216 changed figures, a script
compared every plotted point before and after. The x positions are the same,
and every y position moved by exactly the height of the extra legend row
(0 or 14 px), because the canvas grows to make room instead of squeezing the
plot. No figure's data changed.

**Nine figures were left alone.** Before redrawing, every script was run
once against the *old* helper. Nine figures came out different even then
(for example `house-overhang/experiments/overhang_value.svg` and
`society-peoplecost/experiments/gain_vs_rho.svg`): their committed SVG no
longer matches their own script and results. That is a different problem,
and each needs its project's attention rather than a bulk redraw, so they
are unchanged here.

The lesson for shared helpers is that a fix to one has two halves: the code,
and the outputs it has already written. The second half is a loop over the
callers, and it is easy to skip.
