---
title: "The closest call we did not print: a near-miss line for a change detector failed two of its three checks"
seo_title: "Why a change detector's near-miss score misleads"
date: 2026-11-22
tags: [changepoint-detection, statistics, pre-registration, negative-result]
description: "Showing how close a rejected change came sounds helpful. On 38 labelled series it ranked noise above real changes, so the detector does not print it."
---

When a change detector says "no change", a reader with a date in mind wants to know how close it came. The
[changepoint detector](../../ventures/changepoint-detector/README.md)'s drift model is a good case. On monthly UK
road deaths, the model that lets the level wander finds no jump at all, not even at the 1983 seat-belt law that
every annotator in the Turing Change Point Dataset marks. So we wrote a function that finds the cut the penalty
refused: of every single cut the model did not make, the one that would have improved the fit the most.

On seat belts it works the way you would hope. The closest call is January 1983, a drop of 3.6 noise standard
deviations, and adding it would save 9.15 of the 10.51 that a change costs under the default penalty. Lower the
penalty to 9.14 and the model lists it; at 9.16 it does not.

## Why it is not on the report

Before running it on anything else we wrote down three checks, in the header of
`eval/closest-call.mjs`, and a rule: if the number does not mean what a reader would take it to mean, it does
not ship. Then we ran it on the 38 labelled series.

1. **Does the closest call land on a real change more often than chance?** Barely. It sat within 5 points of an
   annotated change the model had missed on 7 of 37 series, 2.02 times the chance rate. The bar was 2.
2. **Does a smaller shortfall mean a likelier change?** No, the reverse. Real hits had a median shortfall of 1.54;
   misses had 0.61. The tiny shortfalls sit on series the model already cuts many times (a median of 8 cuts,
   against 3 elsewhere). When a model is cutting into noise, there is always another cut almost as good. A small
   gap means "this series is over-cut", not "a real change nearly made it".
3. **Is the number a threshold?** "Would save 9.15 of 10.51" invites the reading "a penalty under 9.15 would
   list it". On 7 of 37 series that is false: lowering the penalty that far lets a different set of cuts win, and
   the closest call is not among them.

The second and third checks failed. So the report says what it said before, and the function stays in the code
for later work. One more thing went wrong, and it is in the write-up too: the first run used the wrong noise
setting by a bug. That output is kept in its own file, and it reads the same way.

## What to use instead

If you have a date in mind (a law, a release, a price change), ask about that date directly. The detector's
`--known-date` option tests the date you name and returns a calibrated p-value. That is a different question
from "where would the next cut go", and it is the one a person with a date is really asking.

All of the figures, the per-series table and the code that produced them are in the venture's README, under "The
closest call", and in `eval/closest-call.out.txt`. The detector is free and MIT licensed. Its results are
statistical estimates from the data you give it, not advice.
