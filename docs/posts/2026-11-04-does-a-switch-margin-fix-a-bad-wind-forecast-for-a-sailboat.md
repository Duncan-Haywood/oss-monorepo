---
title: "Does a tack margin fix a bad wind forecast for a sailboat?"
date: 2026-11-04
description: "A pre-registered negative result from the marine-hull programme: damping tacks with a fixed margin made a replanning sailboat controller worse at every forecast skill."
tags: [marine-hull, sailing, negative-result]
---

# Does a tack margin fix a bad wind forecast for a sailboat?

The `marine-hull` programme simulates a boat beating upwind in a corridor using
6-minute NOAA CO-OPS wind from US harbours. The last step found that a controller
replanning hourly from a forecast only beats a plain header-follower if the forecast
stays skilful for about 30 minutes or more; with less skill it tacks 150 to 250
times a day and loses.

The obvious fix is a switch margin: tack only if it beats staying by some amount.
We wrote four predictions first, then ran 48 windows a month across forecast skills
of 0, 30, 60 and 120 minutes and margins of 0, 0.5, 1 and 2 minutes of progress.

It does not work. Every positive margin made the result worse, at every skill. At
120 minutes of skill the gain over the header-follower was +3.4 points with no
margin and -0.3 with a margin of 0.5. Tacks per day fell, but the tacks removed
were mostly ones worth making; the value table already prices a tack. Three of four
predictions were refuted, and the fourth held in one month out of two.

What is left is a smarter rule (a margin scaled to the tack cost, or time
hysteresis), tried next. Log, code and numbers are in
`research/marine-hull/LOG.md`, milestone 5e. AI-assisted research; the forecast
error is a synthetic model, not an archived forecast.
