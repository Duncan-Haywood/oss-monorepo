---
title: "The worst case for a beam over three posts is not every span loaded"
date: 2026-11-12
tags: [continuous-beam-calculator, construction, structural, framing, new-venture]
description: On two equal spans, live load on one span gives 36% more sagging moment than on both, and lifts the far end. A free tool finds the worst pattern exactly.
---

A deck beam set on three posts, or a floor beam that runs over a middle bearing wall, is a *continuous* beam. Span tables and the usual free beam calculators handle one span, maybe with an overhang. The framing checks in this repository's [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) do the same: every header, trimmer and cantilever check there says "closed-form simple span".

A simple span hides one thing in particular. On one span, the worst case is the live load everywhere. On a continuous beam it isn't.

## The two-span example

Take two equal 12 ft spans and 400 lb/ft of live load. Load both spans and you get the textbook figures: 1,800 lb at each end post, 6,000 lb in the middle, −7,200 lb·ft over the middle post and a peak sagging moment of 4,050 lb·ft (9/128 wL²).

Now take the load off the right span. The middle post's hogging moment halves, so the left span sags more. Its end reaction rises to 7/16 wL = 2,100 lb, and its peak sagging moment is 2,100² / (2 × 400) = **5,512.5 lb·ft, 36% more**. Meanwhile the unloaded far end is pulled **up** with 300 lb. That post or hanger is in tension unless the dead load holds it down.

Live load (people, furniture, snow) can sit anywhere, so a check has to cover every arrangement.

## Exact without trying every arrangement

With n spans there are 2ⁿ arrangements, but none of them needs trying. The beam is elastic, so the effect of live load on several spans is the sum of the effects of each span loaded alone. The largest sagging moment at a point therefore comes from adding every span whose contribution there is sagging and leaving out the rest. The [continuous beam calculator](https://marisstella.app/continuous-beam-calculator/) solves the dead load once and each span's live load once. At every station it adds the contributions that make each effect worse. Then it re-solves the governing pattern to find the exact peak inside the span, from the roots of the shear for moment and by bisection on the slope for deflection. The table on the page shows which spans carry live load at each peak, for example "live on spans 1, 3".

Each of those n + 1 solutions is exact for ordinary (Euler-Bernoulli) bending. The beam is cut at every support and load point. Inside each piece the load is linear, so the stiffness method gives exact displacements at the cuts, and shear, moment and deflection inside follow in closed form. Nothing is sampled on a grid.

## How it was checked

- Textbook coefficients: simple, cantilever, propped and fixed-fixed spans; two and three equal spans, including the patterned 49/512 wL² and 0.10125 wL²; the three-moment equation with unequal stiffness.
- Brute force over all 16 live arrangements of a four-span beam with an overhang. The superposed envelope matches.
- An independent solver with no stiffness matrix: Macaulay's singularity functions in exact Python fractions. On 60 random beams with fixed ends, overhangs, point moments and tapered loads, moment, deflection and reactions agree to about one part in 10¹¹.

One real defect turned up while building the page. A determinate overhang's moment does not depend on the other spans at all, but round-off made those spans contribute about 10⁻¹³. The pattern list then said "live on spans 3, 4" for the end overhang. Contributions below 10⁻¹⁰ of the largest at a station now count as zero.

## What it is not

It analyses the beam you type, against the allowables you type. It does not pick a member, adjust allowables for duration or size, or check buckling, bearing, notches or connections. Anything that carries people still wants an engineer or your local span table. Next steps would be internal hinges and spring supports, a size picker that tries a list of sections, and wiring it into the framing takeoff so beams over several posts are checked as continuous members. The source and both checks are in [`ventures/continuous-beam-calculator`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/continuous-beam-calculator), MIT licensed.
