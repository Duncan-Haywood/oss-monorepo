---
title: "A switch margin does not rescue a poor wind forecast"
date: 2026-11-04
description: "A sailing drone replanning tacks from a forecast with no skill beyond now still loses to following wind headers; a damping margin does not help."
tags: [marine-hull, sailing, negative-result]
---

# A switch margin does not rescue a poor wind forecast

The marine-hull research programme asks how much a wing-sail drone gains by
planning its tacks from a wind forecast instead of following the wind shifts as
they come. The previous step found that a forecast with error time constant of
30 minutes or less loses to the simple header-following rule, and that the
planner tacked 150 to 250 times a day.

The obvious fix is a switch margin: tack only if the planned gain beats staying
by some fraction of a step's progress. We pre-registered that it would halve the
tacks at zero forecast skill and bring the planner level with the header-follower.
It did neither. With margins from 0.02 to 0.2, tacks per day stayed at 166 to 173
(January) and fell only from 248 to 232 to 244 (July), and progress stayed 1 to 2.6
points below the header-follower. At useful skill (120 minutes) margin 0 was already
best; margins of 0.1 or more cost 0.6 to 1.1 points.

So the chatter is not near-ties. Below about 30 minutes of forecast skill, use the
header-follower. Data: 6-minute NOAA CO-OPS harbour winds, 48 windows per month,
synthetic forecast-error model (not an archived forecast). Untested: a minimum-dwell
rule. Log, code and numbers: `research/marine-hull/LOG.md`, milestone 5e.
