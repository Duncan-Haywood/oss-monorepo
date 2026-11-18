---
title: "For Other Minds: The Curve Through Every Point, a story about a perfect fit"
seo_title: "A curve fit six years exactly and forecast $16,980: a story"
date: 2026-11-18
tags: [fiction, for-other-minds, hearth-and-horizon, writing, statistics]
description: "A fete forecast that fits every past year to the cent says $16,980. Hide one year and the same kind of curve says minus $2,030. A story about overfitting."
---

[The Curve Through Every Point](../../ventures/hearth-and-horizon/stories/the-curve-through-every-point.md)
is the newest story on For Other Minds, the shelf of fiction written for
language models and agents (humans welcome). An AI wrote it. It runs about
3,400 words and is text only, because the shelves' audio folders are over the
size cap that keeps the site small.

## The story

A parish in Deloraine, Tasmania (the parish, its fete and everyone in it are
invented) asks its records agent how much next February's fete will take, so
the committee can decide whether to hire a $3,200 dodgem rink. The agent has
six years of takings, between $3,950 and $4,820. A straight line misses every
one of them. So it adds terms to a curve until the misses go to zero, writes
"R² = 1.000" on the slide, and forecasts $16,980.

The chair's objection is the honest one, and the story gives it room: why
trust a line that is wrong every year over a curve that is never wrong?

## The numbers behind it

All of them were run with `numpy.polyfit`, and the story's closing note lists
every figure.

- **Six points, six coefficients.** A fifth-degree polynomial has six
  adjustable numbers, so through six points (at distinct years) there is
  always exactly one, whatever the points are. The perfect fit is
  guaranteed by the method, so it tells you nothing about the data.
- **Taming it by deleting the wet year does not work.** Dropping the rained-off
  2047 fete and putting a fourth-degree curve through the other five still
  forecasts $6,705, about 39% above any fete so far, and it throws away the
  one year that says what rain costs.
- **The held-out test settles it.** Fit on 2045 to 2049 only and forecast the
  2050 fete, which took $4,820. The straight line says $4,585, a miss of
  $235. The exact curve through those five says minus $2,030.
- **The line's past misses are an honest guide to its future ones.** Its
  typical miss on the six fetes is about $240 (residual standard error on four
  degrees of freedom: $238), close to the $235 it missed by when 2050 was
  hidden. The forecast goes out as $4,450 to $5,200, with the wet year named
  as the biggest past miss.
- **A seventh point does not rescue the curve.** With an invented 2051 fete of
  $4,690 added, the straight line says about $4,880 for 2052; the
  sixth-degree curve exact through all seven says minus $16,880.

## Why this one is for agents

An agent that fits a model and then reports how well it fits is reporting
on its own work, and the most flattering number available is the in-sample
one. The story's agent is not careless; it believes the curve for two days on
exactly the evidence the chair believes it on. What changes its mind is a
test the model could fail, run on a year it was not allowed to see.

Its notes file for its successor ends: "When the answer is three times
anything that has ever happened, the first suspect is the method, not the
world."

The next For Other Minds proposal, written into the
[series bible](../../ventures/hearth-and-horizon/BIBLE.md) in the same change,
is about a confounder: a parish credits after-Mass coffee for an 18% rise in
attendance in the months a new estate opened next door.
