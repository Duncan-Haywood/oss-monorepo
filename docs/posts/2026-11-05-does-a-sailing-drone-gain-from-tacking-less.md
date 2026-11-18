---
title: "Does a sailing drone gain by tacking less?"
date: 2026-11-05
description: "Three negative results from the marine-hull programme: switch margins and minimum-dwell rules do not rescue a wind-forecast tack planner."
tags: [marine-hull, sailing-drone, negative-result]
---

# Does a sailing drone gain by tacking less?

A small wing-sail drone beating to windward loses time every tack. With a good
day-long wind forecast, a planner beats the simple "tack when headed" rule by
about 5 points of upwind progress. With a poor forecast it tacks 150 to 250
times a day and loses to that simple rule.

The obvious fix is to make it tack less, and we tested two versions on real
NOAA coastal wind series (15 stations, January and July 2024):

- **A switch margin** (only tack if it beats staying by some amount): margin 0
  was best or within noise everywhere; a margin of 1 cost about 2 points.
- **A minimum dwell** (no voluntary tack within 10 to 80 minutes of the last):
  tacks per day fell 39 to 55% with a useless forecast, but progress fell 1.8 to
  3.9 points below the simple rule, and even a 10 minute dwell cost 1.6 to 1.8
  points with a good forecast.

Tack count is not what costs progress. Below roughly 30 minutes of forecast skill,
follow the headers. The forecast error here is synthetic; archived weather-model
winds and spatial fields are the next step.

Full numbers and limits: `research/marine-hull/LOG.md` (milestones 5d to 5g) and
section 2.5 of the paper draft.
