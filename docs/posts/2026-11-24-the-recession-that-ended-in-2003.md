---
title: "The recession that ended in 2003: dating business-cycle turns on data as it was first published"
seo_title: "Dating recessions on real-time data: the 2003 trough"
date: 2026-11-24
tags: [changepoint-detection, statistics, pre-registration, business-cycles]
description: "A 6-month call rule fixes two shifted turns on real FRED-MD vintages, but on 2004-06 data the 2001 recession still ended in 2003: the jobless recovery."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) can date business-cycle peaks and
troughs from a composite of payrolls, real income and industrial production (`--turns --columns`). Earlier today
we replayed it on the data people actually held at each month, the FRED-MD vintages from 1999 to 2021, instead
of today's revised numbers. Two of the six NBER turns since 1999 sat four months off for years, and a strict
scoring rule (the turn has to stay within 3 months of NBER's month) turned each of those shifts into a call a
decade late.

So the next question, written down before running anything: if a turn counts as called once it stays within
**6** months of NBER's month, do the real vintages look like the revised replays? To make sure a wider window
couldn't win just by catching noise, we also scored ten placebo turns, NBER's dates moved 12 months either way.

## What came back

| NBER turn | strict rule | 6-month rule | revised data |
|---|---|---|---|
| peak 2001-03 | 156 months | 2 | 7 |
| trough 2001-11 | 61 | **61** | 8 |
| peak 2007-12 | 8 | 8 | 7 |
| trough 2009-06 | 132 | 7 | 8 |
| peak 2020-02 | 7 | 7 | 7 |
| trough 2020-04 | 7 | 7 | 7 |

The wider window fixed the two shifts: the 2009 trough is called 7 months after it happened, before NBER announced
it. The 2001 peak is "called" after just 2 months, but only because the composite already showed a peak in
2000-09, six months early, right on the window's edge. We read that as luck, not speed. One placebo out of ten got
through (the strict rule let none through), which stayed inside the limit we set.

One pre-registered bar failed. The 2001 trough is still 61 months late, and no window shorter than 17 months fixes
it. So, as decided in advance, nothing in the tool changes.

## Why: the jobless recovery

On every vintage published from early 2004 to late 2006, the composite doesn't show a 2001 recession with a
trough in late 2001. It shows **one contraction running from 2000-11 to 2003-04**. Payrolls carry about 60% of the
weight, and payrolls as published back then kept falling well into 2003. Later benchmark revisions moved the
trough back to around 2001-12 and left 2002-03 as a separate soft patch.

None of this is the window's fault. It's what the data said at the time. Someone running this tool in 2005 on the
numbers they had would have dated the end of that recession about a year and a half after NBER did.

## What to take from it

- The dated month of a mild turn can move by four to six months as the data are revised. Big, sharp turns (2008,
  2020) stay put.
- A recession followed by a jobless recovery can look much longer on payroll-heavy data as first published, and
  it can stay that way for years.
- The pseudo-real-time replays we ran earlier, built on today's revised data, should be read as upper bounds.

The script, its pre-registered bars and the output are in the venture's
[README](../../ventures/changepoint-detector/README.md) ("A tolerant call rule on real vintages"). Everything is
MIT licensed and runs locally: `node eval/turns-vintages-tolerant.mjs`.
