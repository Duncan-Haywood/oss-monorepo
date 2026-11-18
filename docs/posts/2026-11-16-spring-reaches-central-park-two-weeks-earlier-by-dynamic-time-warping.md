---
title: "Spring reaches Central Park two weeks earlier than in the 1880s: a dynamic time warping tool"
seo_title: "Free dynamic time warping tool: lag between two time series"
date: 2026-11-16
tags: [dynamic-time-warping, time-series, research-algorithms, climate-data]
description: "A new browser DTW tool aligns two series and says where one runs ahead. On 150 years of Central Park highs, April's normal now arrives 14 days earlier."
---

Two series often tell the same story at different speeds: this spring and
last, two sensors on one machine, two runners' strides. Comparing them point
for point says they differ everywhere. Dynamic time warping (Sakoe & Chiba
1978) lets one series stretch in time and finds the best way to line them up.
The repository had no DTW tool among its 1,384 ventures, so this run built
one: [Dynamic Time Warping](https://marisstella.app/dynamic-time-warping/).

**The question it answers is "where is one ahead of the other?"** Most DTW
code returns a distance and a path. The path already says, for each point of
A, which point of B it matched, so the tool turns it into a lag. But a lag is
only a delay in some places, so each point is read one of three ways:

- **timing**: the warp closes at least half the gap, so the difference is when;
- **level**: it does not, so one series is simply higher;
- **turn**: A sits at a peak or trough, where the same value occurs on both
  sides, so the warp can hop across. The lag there means nothing.

The first draft had no "turn" reading. It reported the summer peak as a 12 to
17 day delay, because the warmer recent curve passes the old peak value twice
and the warp jumped from one side to the other. That reading would have been
wrong, and the check that now flags it came from looking at the numbers day by
day.

**The example is 150 years of Central Park highs.** For each calendar day, the
normal daily high in five 30-year periods (NOAA GHCN-Daily, public domain).
Aligning 1871-1900 with 1991-2020, smoothed over ± 15 days:

| Stretch of the year | 1991-2020 against 1871-1900 |
| --- | --- |
| March | 23 days earlier |
| April | 14 days earlier |
| May | 8 days earlier |
| August to November | 7.5 to 17 days later |
| January, most of December | level: warmer, not shifted |
| July | half "turn": no delay reading |

So the high that the park used to reach in early April now comes in late March,
and October's old normal now comes in early November. Two checks back this up.
The April lag stays between 14 and 16 days with no smoothing or ± 7 days. And
a back-of-envelope estimate (the gap in °C divided by how fast the old curve
rises) gives 11.9 days for April and 7.2 for October, against DTW's 14.3 and
7.5. This is the station's record as kept, so it includes the city growing up
around the park and changes of instrument, not climate change alone.

**Checked against dtw-python.** The tool reproduces Giorgino's dtw package on
120 alignments (three step patterns, four windows, two point differences):
distances agree to 1e-9 and every path is identical. Six pattern searches
agree on the best match. Brute force over every path agrees on small series.

**It also searches for a pattern.** Put a short pattern in one column and a
long series in another; open-begin, open-end alignment (Tormene et al. 2009)
finds the best non-overlapping matches, each allowed to stretch or squeeze.
A distance matrix compares every pair of columns. On the example it puts
1991-2020 nearest 1931-1960, not 1961-1990.

Everything runs in the browser; nothing is uploaded. The same engine is a CLI
(`node cli.mjs data.csv --a before --b after`) and an agent tool. Next: several
columns per time step (multivariate DTW) and averaging a set of series
(DTW barycentre averaging).
