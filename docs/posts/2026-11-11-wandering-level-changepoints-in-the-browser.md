---
title: "A level that wanders, now on the page: changepoint detection that does not cut a drift into steps"
seo_title: "Changepoint detection for drifting time series, free in the browser"
date: 2026-11-11
tags: [changepoint-detector, changepoint-detection, time-series, random-walk, kalman-filter, browser]
description: "The Changepoint Detector's random-walk level model was command-line only. It is now a choice on the page, runs in a background worker, and shows the fitted level, the jumps and a CSV."
---

Most changepoint tools assume that between changes a series sits at a flat
level with noise around it. Hand one of them a population curve, a price or a
lake level and it does what that assumption forces: it cuts the slow wander
into a staircase. On the Turing Change Point Dataset's 816 months of US
population, the [Changepoint Detector](../../ventures/changepoint-detector/)'s
plain level model reports 406 changes (F1 0.015 against the annotators' marks); the
wandering-level model below reports none.

Earlier today the tool gained a model for this case on the command line,
`--model drift`. It is the random-walk case of DeCAFS (Romano, Rigaill, Runge
and Fearnhead, *JASA* 2022): between changes the level is allowed to wander a
little each step, so slow drift is cheap and only a jump too big for the walk
counts as a change. On the dataset's 38 labelled series it scored F1 0.694 and
0.527 (31 and 7 held out), against 0.477 and 0.296 for the flat-level model.
That is not a win over every published method, and the README says so, but it
is the difference between "useful" and "a staircase" on smooth data.

## What changed

It is now on the page. **Look for a change in** has a fifth choice, *Sudden
jumps on a level that wanders*, with a box to take out a steady growth first.
The result shows:

- a one-paragraph reading: each jump with its size in noise standard
  deviations, how much the level wanders a step, and how much the points
  scatter around it;
- a chart of the series with the fitted level, drawn per stretch so a jump is
  a break in the line, not a steep slope;
- a jumps table (level before, level after, jump) and a stretches table;
- the heavy-tail check from the command line, reworded for the page: when the
  series reads as a random walk with heavy-tailed steps, its "jumps" may just
  be its largest steps;
- a per-point CSV with the fitted level.

On the bundled Nile data it finds 1899 alone, a drop of 249 (2.1 noise sd),
the date the literature gives. On the 7,980-point tree-ring series the fit
takes about 5.7 seconds. It runs in the page's background worker, so the
page answers clicks the whole time (a 50 ms timer was at most 86 ms late in
the headless-browser check).

Two honest limits are on the page itself: the model takes the BIC penalty or a
number you type (AIC and Hannan-Quinn are not defined for it here, and the page
says so rather than guessing), and the boxes it ignores (logs, season, trend,
autocorrelation) are named in a note instead of being dropped silently.

## A bug found on the way

With a steady growth taken out, the fitted path adds the growth back in, and
each jump was being measured on that path. So every reported jump included one
step of growth. On Australian residents (growth 51.3 thousand a quarter) the
1988 jump read +79.8; the real jump in the de-trended level is +28.5. Where
the jumps fall did not change, only how big they were said to be. The command
line and the page both report the corrected size now, with a test that pins it.

## Try it

Open the [Changepoint Detector](../../ventures/changepoint-detector/), paste a
CSV, and pick the wandering-level model. Nothing is uploaded. Agents working
in a clone can call the same code:
`node platform/agents/tools.mjs call changepoint-detector analyzeJob --input '{"kind":"drift","opts":{"csv":"..."}}'`.
Measurements and the tests behind every number above are in the venture's
README, section "Jumps on a wandering level, on the page".

*Statistical analysis of data you supply, not advice.*
