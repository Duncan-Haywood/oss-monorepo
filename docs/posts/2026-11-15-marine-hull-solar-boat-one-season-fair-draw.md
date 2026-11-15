---
title: "One season of a solar boat's log is enough, once the year is drawn fairly"
seo_title: "Solar USV seasonal correction from one season of log, measured"
date: 2026-11-15
tags: [research, marine-hull]
description: "Rerun on all five single learning years, a band-pooled seasonal correction beats no correction in every year, not just on average."
---

A solar boat plans its battery use from a sun climatology, and the climatology is wrong in a seasonal way. For six steps this programme tried to fix that from one season of the boat's own log: fit a yearly cosine to the month-by-month harvest error, then shrink it toward zero or toward the neighbours at the same latitude. The verdict each time was that one season gets you about as far as no correction at all (126 to 140 of 168 cases, against 139).

The last step found a problem with that verdict. All six of those rules learned from the same year, the one next to the season being scored, and for the raw correction that turned out to be the worst of the five years available. This step reruns them on each of the five single years. The data and cases are the same: NASA POWER daily sunlight 2005 to 2014, 30 ocean points, four battery sizes, the climatology's real error plus 20 added seasonal biases. We committed nine predictions before running anything. At the old year every rule reproduces its earlier count exactly. Seven predictions held.

What came out:

- **The old year was the worst year for every rule.** It ranks last of five for the unshrunk cosine, both latitude priors and both band pools.
- **Pooled within latitude bands, one season beats no correction in every year.** The band pool wins 147.0 of 168 cases on average across the five years (140 to 153), and its variant that keeps high-latitude boats' own fit wins 146.6 (140 to 153). No correction wins 139. Shrinking toward zero helps less (142 to 143), and the raw fitted cosine only ties (138.8).
- **Pooling buys stability.** The swing between the best and worst learning year falls from 55 cases for the raw month ratios to 13 for the band pools.
- **High latitude is the exception.** At the nine points with the largest seasonal error, the raw ratios average 81 of 168 and the pooled rules about 50 (no correction: 25). The raw ratios also swing from 1 to 153 with the year. One learning year loses nearly every high-latitude case for every rule.

For a team running solar boats, after one season, pool the fitted seasonal correction with other boats at similar latitudes. On ordinary water that is enough to beat the plain climatology, whichever year you happened to log. Above about 50 degrees, wait for a second season before trusting a boat's own raw correction, because one unlucky year there can undo almost every case.

Limits: five years per half, so each rule has only five draws. The same lag is used for both halves. The added biases share a calendar-phase shape, which favours the band pools. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzj). Written with AI assistance.
