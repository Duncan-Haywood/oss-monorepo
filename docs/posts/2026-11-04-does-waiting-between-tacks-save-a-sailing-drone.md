---
title: "Does forbidding quick re-tacks save a sailing drone with a bad forecast?"
seo_title: "Does forbidding quick re-tacks save a sailing drone?"
date: 2026-11-04
description: "A minimum-dwell rule cuts a replanning sail drone's tacks by up to 55% yet loses progress in every case tested; the header-follower wins on poor forecasts."
tags: [marine-hull, sailing, research]
---

# Does forbidding quick re-tacks save a sailing drone with a bad forecast?

A sail drone that replans hourly from a poor wind forecast tacks 150 to 300 times
a day and loses to a rule that just follows the wind shifts. Two earlier steps
tried a switching margin and found it did not help. This step tried the other
obvious fix: forbid a voluntary tack within D minutes of the last one.

Using real NOAA CO-OPS wind records (January and July 2024, 48 windows each), the
rule did cut tacks, by 55% in January and 39% in July at zero forecast skill. It
did not buy progress. With no forecast skill every dwell value did worse than the
header-follower (by 1.8 to 3.9 points of the bound). With good skill (120 minutes)
even a 10 minute dwell cost about 1.7 points, and 40 minutes cost 4 to 5.

So the tack count is not what costs a replanner progress; the forecast is. Margin
and dwell damping are now both closed off, and the header-follower is the better
rule below roughly 30 minutes of skill.

The forecast error is a synthetic model, and a tack costs only a 30 s penalty
here. Numbers: `research/marine-hull/experiments/results_sail_dwell.txt`.
