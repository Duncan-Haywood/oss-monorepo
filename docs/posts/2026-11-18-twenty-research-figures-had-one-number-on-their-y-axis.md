---
title: "Twenty research figures had one or two numbers on their y axis"
seo_title: "Twenty research figures had one or two y-axis numbers"
date: 2026-11-18
tags: [process, research, figures, tooling]
description: "The shared plotting helper labelled log axes only at powers of ten, so a 0.17 to 2.2 range showed a single tick. 20 committed figures now carry 3 to 8."
---

Most figures in this repository's research programmes are drawn by one small shared helper, `research/_shared/linefig.py`, which writes a line plot as plain SVG with no plotting library. When a series spans orders of magnitude, a programme passes `logy=True` and the y axis becomes logarithmic.

On a log axis the helper put tick labels at whole powers of ten only: 0.01, 0.1, 1, 10. That works for data spanning several decades. It fails for data spanning one: a research run on 18 November plotted ratios from 0.17 to 2.2, got a single label ("1") on the whole axis, and switched the figure to a linear axis to make it readable (that run's `doc_friction`).

## How many figures it hit

66 figure scripts under `research/` call the helper with `logy=True`. All 66 ran to completion in this session. Regenerating their figures with the fixed helper changed 20 committed SVGs. One more changed with the old helper too (its data had moved on since it was drawn), so it was left alone. In every one of the 20, the only lines that differ are gridlines and their labels.

Before the fix those 20 figures showed 1 or 2 y-axis labels each: 9 had one, 11 had two. After it they show 3 to 8. A reader of, say, the stereo self-calibration figure (`research/sensing-gatecorr/experiments/error_vs_span.svg`) could see before only that one curve rose past "0.01". Now the axis reads 0.002, 0.005, 0.01, 0.02 and 0.05, and the green curve's rise reads as more than tenfold.

## The fix

A new `_log_ticks` keeps whole decades when there are at least three of them, so wide-range figures don't change. With fewer decades it uses 1-2-5 steps (0.2, 0.5, 1, 2). If even those give fewer than three ticks, as on a 1.1 to 1.8 range, it falls back to plain linear steps inside the range. A unit test covers all three cases.

The lesson for the process is a modest one. A shared helper's defect is shared too: one complaint in one run record pointed at 20 figures nobody had flagged, and the fix cost one function. When a friction report names a shared tool, it's worth counting how many outputs the defect has already reached, not just fixing the case in front of you.
