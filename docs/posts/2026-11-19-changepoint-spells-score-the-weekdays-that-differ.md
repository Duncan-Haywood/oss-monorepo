---
title: "Count only the weekdays that changed: a sharper search for short spells of fewer updates"
seo_title: "Finding short reporting-schedule changes by weekday"
date: 2026-11-19
tags: [changepoint-detection, data-quality, monitoring, statistics]
description: "Scoring only the weekdays whose repeats rise found 283 more simulated reporting spells of 2,400 with no extra false alarms, and now names the weekdays."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an opt-in `--spells` check. It looks
for a month or two when a dated series was published on fewer days and then went back to its old schedule: South
Dakota's COVID-19 feed going to Wednesdays only in July 2021, for example. This morning's round found the check's
limit. It works when the two schedules differ on many days, and it misses up to two in five spells that differ
on only eight or nine. A month of Monday/Wednesday/Friday inside a Monday-to-Friday schedule is like that: only
the Tuesdays and Thursdays change.

## Why few changed days get lost

The search scores a candidate spell weekday by weekday: how much better does a separate repeat rate inside the
spell explain each weekday than one rate for the whole stretch? It adds the seven scores and compares the total
with a penalty. On the five weekdays where the schedules agree, that score is pure noise. The penalty has to sit
above the noise of all seven weekdays, so a spell that is real on two of them often falls short. Before writing
the new rule we looked at the misses of the old one on a scratch seed, and said so in the
[header](../../ventures/changepoint-detector/eval/update-rate-spells-weekdays.mjs). All 11 missed one-month
spells were in the right place with scores of 25 to 46, against a bar of 49.

## The new score

The new score counts a weekday only when its repeats rise inside the spell and its score clears a floor. Each
counted weekday adds what it scores above that floor. With the noise weekdays gone, the penalty can come down
without raising false alarms. The floor and the penalty were chosen on one simulation seed and tested on two
fresh ones, with five bars written down first:

| on fresh seeds | new score | old score |
|---|---|---|
| false spells a series, worst of 23 no-spell cells | 0.010 | |
| false spells a series, 24 no-spell cells after six different series openings | 0.000 | 0.000 |
| one-month Mon/Wed/Fri spells found, six openings (of 1,200) | 999 | 905 |
| two-month Monday-Friday spells inside daily, six openings (of 1,200) | 1,129 | 940 |

That is 283 more spells found out of 2,400, against a bar of 150. No spell shape lost more than one series in a
cell. A second variant that also used the weekday score on stretches with no weekly pattern raised false spells
on clumpy series, so it was not chosen. On the real Johns Hopkins series, Alaska's and South Dakota's spells
still end in their documented return windows. Across 35 states the new score reports the same eight spells as
the old one, with edges up to 11 days apart.

## What a user sees

Because the score knows which weekdays it counted, the line can now name them. On South Dakota:

```
2021-07-03 to 2021-08-10 (39 steps): the value repeated on 85% of steps inside, against 32% before and after,
read on the weekdays where the schedule changed (Mondays, Tuesdays, Thursdays and Fridays).
```

That is the Wednesdays-only schedule described from the other side. It is still an opt-in. The one-month
Mon/Wed/Fri spell is still the hardest case: after a series that opens with a run of zeros it is found about
three times in four. The New York Times series that failed the old search has not been rerun on the new score.
That rerun, pre-registered, is next. The [README section](../../ventures/changepoint-detector/README.md) has
every number.
