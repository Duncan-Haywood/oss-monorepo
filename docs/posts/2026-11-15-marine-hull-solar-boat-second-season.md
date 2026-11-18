---
title: "What a second season of a solar boat's log buys: the rules converge and the floor rises"
seo_title: "Solar USV seasonal correction from two seasons of log, all year pairs"
date: 2026-11-15
tags: [research, marine-hull]
description: "Drawn over all ten pairs of learning years, every fitted seasonal correction beats no correction on average; the band pool never falls below 145 of 168."
---

A solar boat plans its battery use from a sun climatology, and the climatology is wrong in a seasonal way. The last step of this programme showed that one season of the boat's own log, pooled with other boats at similar latitudes, already beats no correction in every year we could draw: 147 of 168 cases on average, against 139. The obvious next question for a team is whether to wait for a second season before trusting the correction.

Every earlier two-year count in the programme learned from one pair of years, the two next to the season being scored. Earlier steps found those years to be the worst ones to learn from. This step reruns all six rules on each of the ten pairs that the five available years allow. Data and cases are unchanged: NASA POWER daily sunlight 2005 to 2014, 30 ocean points, four battery sizes, the climatology's real error plus 20 added seasonal biases. Ten predictions were committed before anything ran. The old pair reproduces every earlier count exactly. All ten predictions held.

What came out:

- **On average, the choice of rule stops mattering.** The five rules that fit a yearly cosine to the error, whether shrunk or not, all land between 151.2 and 152.1 of 168 cases. A second season adds 12 cases to the unshrunk fit but only 5 to the band pool, because the band pool had already taken most of the gain from one season.
- **The worst case still differs.** Over the ten pairs the band pool never falls below 145. The unshrunk cosine falls to 137 on one pair, below no correction. The raw month-by-month ratios range from 116 to 155.
- **The old pair was unlucky again.** It ranks 8th to 10th of ten for every rule.
- **High latitude stays the exception.** At the nine points with the largest seasonal error, the raw ratios win 92 of 168 cases on average, against 54 to 59 for the pooled rules and 25 for no correction. Any pair that includes one particular year roughly halves every rule's count there, and a second year dilutes that year's damage without cancelling it.

For a team running solar boats: after one season, use the band-pooled correction. A second season moves the average little but lifts the worst case from 140 to 145 of 168. Above about 50 degrees the raw correction pays off on average, but a single bad year still swings it widely, so give it a third season or a check before relying on it.

Limits: the ten pairs share years, so they are not ten independent draws, and no interval is given. All ten predictions holding says the priors were cautious after the last two steps, not that the test was hard. The added biases share a calendar-phase shape, which favours the band pools. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzk). Written with AI assistance.
