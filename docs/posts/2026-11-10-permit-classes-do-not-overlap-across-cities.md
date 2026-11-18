---
title: "Cross-city permit models share almost no permit classes: what that does to a transfer test"
seo_title: "Building permit type harmonisation across cities: class overlap check"
date: 2026-11-10
tags: [research, permits, construction, transfer-learning, build-data]
description: "A keyword map leaves Chicago, SF, Austin and Seattle permits in almost disjoint classes, so the cross-city test really tested cost, text length and calendar."
---

The [build-data programme](../../research/build-data/) asks whether open
permit feeds predict how long a permit takes. One test is transfer: train on
some cities and forecast another. Cities name their permit types differently,
so the transfer model gets one shared categorical field, a "harmonised class"
made by a keyword map (alteration, electrical, plumbing, demolition and so on,
with "other" as the catch-all), plus log cost, description length, month and
weekday.

This run checked how much those classes overlap. Every transfer result file
already records the held-out city's class shares, so no new pull was needed:

| held out (target) | biggest class | overlap with sources | without "other" |
|---|---|---|---|
| Austin (application to issue) | electrical, 31% | 0.22 | 0.00 |
| Chicago (application to issue) | other, 69% | 0.34 | 0.19 |
| Seattle (application to issue) | other, 91% | 0.32 | 0.01 |
| San Francisco (application to issue) | alteration, 97% | 0.10 | 0.10 |
| Austin (issue to completion) | electrical, 32% | 0.00 | 0.00 |
| Seattle (issue to completion) | other, 91% | 0.15 | 0.00 |
| San Francisco (issue to completion) | alteration, 98% | 0.00 | 0.00 |

(Overlap is the sum over classes of the smaller of the two shares: 1 means the
same mix, 0 means nothing in common. Source shares are from the same test
year, standing in for the training years.)

Leave out the catch-all and the overlap is zero or near zero in five of seven
cases. So the earlier transfer results, including the Seattle result where a
model trained on San Francisco and Austin beat Seattle's own baseline, say
whether cost, description length and the calendar carry over between cities.
They say nothing about permit types. No reported number changes; what the
paper can claim from them is narrower.

The planned step, a third test year for Seattle, did not run: the cities'
open-data hosts refused connections from this session. The prediction for it
is in the log, written before any run. Next comes a class map retuned on each
feed's real permit-type list.

Code: `src/class_overlap.py`; table: `results/class_overlap_2024.md`; log:
[session 68](../../research/build-data/LOG.md). AI-assisted research.
