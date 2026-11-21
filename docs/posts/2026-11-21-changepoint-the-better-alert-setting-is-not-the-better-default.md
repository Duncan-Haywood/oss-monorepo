---
title: "The better alert setting is not the better default: it reads a growing site as a string of steps"
seo_title: "Why a better traffic alert setting did not become the default"
date: 2026-11-21
tags: [changepoint-detection, statistics, search-console, pre-registration]
description: "Pre-registered: Middle cut days unaware of a traffic fall from 36 to 18, but alerted on 20 of 40 simulated sites that were only growing. The default stays."
---

This morning the [changepoint detector](../../ventures/changepoint-detector/README.md) gained a middle alert setting
for daily counts such as Search Console clicks. It is PELT with a negative-binomial cost, and on simulated sites it
heard 115 of 120 falls of 20%, where the quiet default heard 38
([earlier post](2026-11-21-changepoint-a-middle-setting-hears-20-percent-search-traffic-falls.md)). The same round
found something awkward: run on its own, with no hint, Middle beat both the hint and the default. So should it be
the default, the setting that runs when a site owner names nothing?

We pre-registered a round to decide
([rules](../../ventures/changepoint-detector/eval/count-default-middle.prereg.md), committed before any run on the
seeds that count) and lost the bet. Here is why.

## One number for "slower but hears more"

Middle waits until a new level is clear, so on a 20% fall it alerts after a median of about 8 days, against 4 to 6
for the default. But the default often never alerts at all. To weigh the two we used **days unaware**: the days from
the fall to the alert that hears it, or the full 60 days of the watch when nothing does. A slow alert costs its
extra days, and a miss costs the whole window.

On 40 fresh simulated sites per cell (50, 400 or 3,000 clicks a day, weekends at 70%, extra day-to-day swing of 15%),
falls of 10%, 20% and 40%:

| | default | Middle |
|---|---|---|
| mean days unaware per fall | 35.6 | **18.2** |
| on 40% falls | 4.5 | 4.1 |
| false alerts per 1,000 days | 0.14 | 0.58 |

With twice the day-to-day swing (30%) the gap holds: 44.6 days against 30.7. The delay is real, but it is a small
price next to the falls the default never reports.

## The case nobody had tested: a site that grows

Every earlier round used sites whose level was flat apart from the fall. Real sites grow. So the round added sites
with no step at all: traffic growing 30% over 240 days, doubling, shrinking 30%, or drifting at random.

| site (no step) | default: sites with any alert | Middle |
|---|---|---|
| grows 30% | 1 of 40 | **20 of 40** |
| grows 100% | 5 of 40 | 40 of 40 |
| shrinks 30% | 5 of 40 | 35 of 40 |
| drifts, 1% a day | 1 of 40 | 24 of 40 |

PELT fits a flat level between changes, so a steady climb is something it can only describe as a staircase of
steps, and it reports each one. On half the gently growing sites, Middle told the owner something had changed when
all that happened was the site doing well. A default that alerts on good news teaches people to ignore it. Middle
also missed a second bar narrowly: on the eleven simulated count series from the hint round it sent 1.02 more false
alerts per 1,000 checks, with the interval's upper end at 1.26 against a bar of 1.0.

The one real shop in the test set (UCI Online Retail's daily orders), which decides nothing, agreed. Without a weekly
period the default sent 2 alerts over the year and Middle sent 7, three of them during the autumn and pre-Christmas
build-up.

## What changed

The default stays as it was. Middle stays a named setting and the hint's middle choice. Two pieces of text changed
because they were now wrong advice. The hint for counts said Middle was "a good place to start", and now adds that
on a growing or wandering series it alerts on the trend. The page's "How eager" menu says the same.

The next thing to try is a Middle that allows for a trend, for example PELT run on the series divided by a slow
rolling level, tested against these same growing sites and falls. The full tables are in the
[README](../../ventures/changepoint-detector/README.md#middle-as-the-count-default-no-2026-11-21-pre-registered-fails-the-default-stays).
All of it is simulated except the one shop, and none of it has been checked on a real Search Console property yet.
