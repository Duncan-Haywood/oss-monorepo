---
title: "A solar boat's battery rule, tested on years it never saw: 7% more distance, no more dark hours"
seo_title: "Solar USV battery reserve rule curve: held-out test on 2020-2024 sun"
date: 2026-11-12
tags: [research, marine-hull]
description: "A battery rule curve for a deck-solar survey boat, tuned on 2015-2019 sun and tested on 2020-2024, keeps the payload lit and adds 6.8% distance past 40 degrees."
---

A small deck-solar survey boat on a year-long mission has one decision to make each day: how much of today's sun to spend on moving and how much to keep in the battery for the payload. Earlier steps of the marine-hull programme found a rule that keeps the payload almost as lit as a boat that never moves. It's a reservoir-style "rule curve" built from past years' sun. The cost is distance, because at 40 degrees latitude and beyond the curve asks for a full battery all year.

The last step (6zl) put the battery's size inside the rule-curve calculation and then led the target by 30 days. That gave the payload uptime back and added about 7% distance. But we picked that variant out of 12 on the same 300 missions we scored it on, so it was an in-sample result.

This step tested it on data it had not seen. Before running anything we fixed an 18-variant grid (sun haircut 0 to 20%, lead 0 to 60 days) and one selection rule: the most distance among variants with no more avoidable payload downtime than the full-pack curve. Then we ran three splits:

- **Time:** tune on 2015 to 2019, score on 2020 to 2024, with every target built only from the five earlier years of NASA POWER sun, which is what a planner launching in 2020 would actually have had.
- **Space, both ways:** tune on the 150 W Pacific meridian and score on the 30 W Atlantic meridian plus five corridor sites, then the reverse.

On the held-out years, the picked curve (lead 45 days, no haircut) had **0.95 times** the full-pack curve's avoidable downtime and covered **6.8% more distance at 40 degrees or more**, and 11 to 12% more at 50 to 60 degrees. The ocean splits agree: 0.84 and 1.09 times the downtime, with 4.1% and 8.4% more distance. Five years of climatology turned out to be as good as nine.

Two of our six predictions failed. We predicted a 20 to 30 day lead, and the time split picked 45. We also predicted the tropics would be untouched, but at one point (20 S, 150 W) a 20% sun haircut pushes the winter forecast below the 30 W payload load, and the extra charge it banks before the austral winter turns into *more* distance.

So the result is a rule a planner can program without a forecast. It still leaves most of the gap to a perfect-foresight plan, which comes from spending on sunny days rather than from how full the pack is kept. That's the next step. These are all simulations in calm water with one boat design. Code, data and the pre-registered predictions are in `research/marine-hull/` (milestone 6zm).
