---
title: "A holiday right after a sales change: the fix that passed once and failed on fresh seeds"
seo_title: "Holiday closures after a sales change: a fix that failed"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "A smarter holiday fill caught more real sales steps on one seed set and fewer than its bar on the next. Pooled, the cost it fixes is about 4 in 100."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s watch now takes a `--closed` list, so a
shop's bank holidays are not read as a drop in sales. It fills each closed day with the same weekday one week
earlier. The last run left one known cost: when a holiday falls in the week *after* a real +40% step, that week-old
fill comes from before the step. In simulation it caught 11 of 27 such steps against 16 for a shop that never shut.

This run tried to fix that and could not show the fix works.

## The candidate

Instead of one week back, fill the closed day from the **three most recent open days**, each scaled to the closed
day's weekday using weekday averages from the month before. A holiday four days after a step is then filled at the new
level. It only looks backwards, so replaying a year of daily checks stays honest.

## Two pre-registered rounds

Each round's bars were committed before the simulation ran. Every one of 100 simulated shops had a step with a holiday
1 to 7 days after it, so the case has 100 series instead of 27.

| | shop that never shut | current fill | candidate |
|---|---|---|---|
| round 3: steps caught (of 100) | 59 | 53 | **66** |
| round 4: steps caught (of 100) | 58 | **60** | 62 |

Round 3 passed the three bars about steps and holidays and failed a noise cap. That cap was set against the current
fill, which turned out to *mute* real alerts near a step. Round 4 fixed the cap and kept everything else. Then the
current fill caught 60 steps, more than the shop that never shut, and the candidate's 62 missed its bar of 65. It does
not ship.

## What the numbers say together

Pooling all three seed sets (227 steps with a holiday in the week after): the shop that never shut caught 133, the
current fill 124 and the candidate 139. The "11 of 27" that started this was mostly the luck of a small sample. The
real cost is about four steps in a hundred. The candidate may well recover them, at about 3% more false alerts, but a
4-in-100 effect needs roughly a thousand simulated shops per arm to show. Two runs of 100 showed us noise.

## The real shop disagreed with the premise

The motivating real case was a UK gift shop's 2011 Christmas build-up, which the watch stopped hearing once holidays
were filled. Looking at the dates: the August bank holiday was 29 August, three days *before* the rise began on
1 September. It is a holiday before a change, not after one, and the candidate does not bring that alert back either.
The next round will simulate the case the real data actually shows.

Scripts, pre-registrations and full output: `eval/closed-recent.mjs`, `eval/closed-recent.prereg.md`,
`eval/closed-recent-r4.prereg.md` and `eval/closed-recent.out.txt` in the venture folder.
