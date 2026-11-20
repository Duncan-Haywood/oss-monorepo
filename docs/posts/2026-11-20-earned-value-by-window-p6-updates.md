---
title: "Earned value by window: hold each P6 update to what the one before it promised"
seo_title: "Earned value per update window from Primavera P6 XER files"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, earned-value]
description: "XER Schedule Check now reads earned value across a series of P6 updates and asks of each month: did it earn what the previous update said it would?"
---

[XER Schedule Check](../../ventures/xer-schedule-check/) already did two
things with a job's monthly P6 updates. It ran a windows analysis, which shows
how far the forecast finish moved in each period and whether progress or
revisions moved it. And it read the
[earned value](2026-11-20-earned-value-from-a-p6-xer.md) of one update. As of
today it reads earned value across the whole series, one window at a time.

## The problem with period SPI

The usual monthly figure is the schedule performance index (SPI): value earned
divided by value planned, where planned value comes from the baseline. An XER
has no timephased baseline. It has the planned dates, and P6 moves those for
unstarted work whenever the schedule is run. Many schedulers re-plan as well.
The "plan" that SPI measures against therefore tends to follow the work. On the
public hospital file we checked this morning, SPI reads 1.34 while the logic
forecasts a finish nine months later than earned schedule does.

So each window now carries a second measure. The previous update was the plan
the contractor submitted for the period. For every open activity, the tool
takes that update's recomputed remaining dates and works the activity for the
hours up to the next data date. It then reads the percent complete the way P6
earns it: by duration, units or physical percent, or by the project's 0/100,
50/50 or custom technique. The total is what that update **promised** the
period would earn. Earned divided by promised is 1.000 when the month went
exactly as forecast. Moving planned dates cannot raise it.

Each window also gives:

- the period's planned value on the **earliest update's** planned dates, held
  as the baseline for the whole series, with SPI on that basis;
- what was **spent**, and the period CPI;
- the activities that **earned less than promised** (or more), that **spent
  well past what they earned**, whose **budget changed** (a revision, so both
  figures are read on the old budget and the change does not count as
  progress), whose earned value or actuals **went down**, and that were
  **added or removed**.

## How we checked it

No public P6 file comes with its next month's update, so the check builds
series from six public files. Update 2 is the file statused exactly as planned
four weeks on. Update 3 is four more weeks with planted trouble: 40 extra hours
on some activities worked in the window, and cost spent at 1.5 times the rate
on others. To make this possible, the statusing code now posts cost and units
with the work, at the planned rate.

| File | Window 1 (as planned) | Slips named | Overruns named | Other activities named |
|---|---|---|---|---|
| Hospital, P6 6.0, 2,020 cost-loaded activities | 1.000, nobody named | 20 of 20 | 20 of 20 | 0 |
| Demo, P6 24.12 | 1.000, nobody named | 20 of 20 | 16 of 16 | 0 |
| Hotel, P6 6.0 | nothing due | 1 of 1 | none eligible | 0 |

With 50 plants of each kind over five seeds, it named 435 of 435 slips and 250
of 250 overruns. On the hospital file, window 2 reads 0.973 to 0.993.

The first run named 18 of 20 slips on the hospital file. The ones it missed
were real shortfalls but small. One activity was 99.6% done, its last 8 hours
became 48, and it earned 0.07% of its budget where it was promised 0.4%. That
fell under a threshold of 0.5% of the activity's budget. The threshold is now
1% of what the activity was promised in the window. The as-planned window still
names nothing, because its rounding error is under a fifth of a currency unit
on 50 million.

## What it does not show

The promise and the generated series come from the same engine. So a 1.000
shows that statusing, the percent-complete reading and cost posting agree with
each other, not that P6 would report the same number. The generator also never
pushes a slipped activity's successors later. On a real update, work held up by
a late predecessor also earns less than promised, and the tool names it too.
The windows analysis beside it says whether that moved the finish. A real
series of updates, and a real baseline export, are the next things to test
against. Method and numbers are in
`ventures/xer-schedule-check/eval/evm-series-check-2026-11-20.md`.

On the page, open all of a job's updates in the windows panel. If they are cost
or hours loaded, the earned value table appears under the delay windows. From
the command line: `node cli.mjs --windows u1.xer u2.xer u3.xer --earned-value`.
Everything runs in your browser and nothing is uploaded. It is a review aid,
not a cost audit or legal advice.
