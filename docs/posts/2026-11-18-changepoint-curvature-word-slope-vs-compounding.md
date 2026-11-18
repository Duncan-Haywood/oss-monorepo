---
title: "A slope runs straight, a compounding gap bends: telling them apart in a synthetic control"
seo_title: "Telling a donor's slope from compounding in synthetic control"
date: 2026-11-18
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "On GDP-like panels a donor's own slope hides among gaps that all grow. Reading each gap's curvature finds it more sharply. Pre-registered, 32,000 panels."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) runs a synthetic control: it fits a weighted
mix of donor series to a treated series before a date, then ranks the treated unit's gap after the date among every
donor's own placebo gap. When a donor ranks above the treated unit, the report names it and describes its gap, because
a donor with an event of its own after the date (a strike, a competitor opening) counts against the treated unit.

On long series that compound, like GDP per head, that description runs into trouble. Every unit's gap grows over time,
whatever happened. Earlier today the tool gained an opt-in word read against the panel's own growth. A pre-registered
re-test then found that the word hides exactly what it should point at: a donor's own steady slope looks ordinary
next to gaps that compound, and it was called "held" 90% of the time.

## The idea, and where it was wrong

A slope that starts at the date runs in a straight line. A compounding gap, we guessed, should speed up. So we measured
the bend of each gap: take the average of the gap over the first, middle and last thirds of the after-period, and ask
how far the middle sits from the straight line through the other two, as a share of that line's rise. Zero means
straight. Below zero means it speeds up.

The exploratory run, made before anything was frozen, showed the guess was half wrong. Gaps on compounding panels do
not speed up on average: their median bend was -0.07, and they spread widely both ways (-0.31 to 0.16, 10th to 90th
percentile). Each one grows in size, but its path is a smooth random curve that can bend either way. A donor's slope
is a straight ramp added on top, so its bend stays close to zero. The useful question is "is it near a straight line?",
not "did it speed up?".

So the rule we froze is two-sided. A unit reads **straight** when its plain word is "grew" and its bend lies between
-0.15 and 0.10. The band came from nine candidates compared on the exploratory panels, so the confirmatory run used
fresh seeds and six bars written beforehand
([pre-registration](../../ventures/changepoint-detector/eval/synth-shape-curve-prereg-2026-11-18.md)).

## What 32,000 simulated panels said

On the 5,995 compounding panels where the panel word is in force:

| | "grew" alone | straight |
|---|---|---|
| a donor's own slope flagged | 86% | 73% |
| a big slope flagged | 92% | 83% |
| units with no event of their own flagged | 65% | 37% |
| odds ratio, slope donor against clean unit | 3.37 | 4.74 |
| pulses flagged | 4% | 0% |

All six bars held, including in each of three growth generators run separately (the closest was 32.0 points of lift
against a bar of 30.6).

## What it does not do

It is a pointer, not a finding. Half the clean units listed above the treated unit still read straight, and in panels
with one slope donor among 10 to 15 others, 14% of the units read straight were that donor (10% for "grew" alone). On
panels that do not compound, "grew" already does better, and requiring a straight line would halve the slopes found.
So the line is read only where the panel word is in force.

## On a real panel

West Germany after 1990, with 16 OECD donors: two units rank above West Germany. The Netherlands' gap held against the
panel but grew on its own reading, and its bend is -0.001: a straight line, the shape of a slope of its own. Norway's
gap grew on both readings, and its bend is -0.18: it speeds up, like an oil economy compounding rather than a ramp. That
is a description, not a test, and it changes no p. But it tells a reader which donor to look into first, and why.

Try it: `node cli.mjs data/oecd-gdp-per-capita-1960-2003.csv --column WestGermany --known-date 1990 --donors all
--window 1960:2003 --shape-word panel`, or the page's "Word the donors ranked above it" select. The full numbers are in
the README section "A curvature word".
