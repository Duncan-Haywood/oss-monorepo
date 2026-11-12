---
title: "Sizing house water pipes with Hunter's rule, computed exactly"
seo_title: "Water supply pipe sizing: Hunter's 99% rule by exact binomial convolution"
date: 2026-11-12
tags: [wall-framing-takeoff, plumbing, construction, probability]
description: A new free page sizes a house's water pipes from Hunter's 99% rule computed exactly. On a two-bath example the normal approximation would pick a 3/4 in main where the exact rule needs 1 in.
---

If every fixture in a two-bath house ran at once, it would draw 27.2 gallons a minute. Nobody sizes pipe for that. In 1940 Roy Hunter at the National Bureau of Standards treated each fixture as busy a fixed fraction of the peak hour, independently of the others, and sized for the flow that is not exceeded 99% of the time. The fixture-unit tables in plumbing codes descend from that rule.

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) could already count a plumbing rough-in (pipe sticks, PEX coils, traps, stops), but its README said plainly "no pipe sizing". So we added a [water supply pipe sizing page](https://marisstella.app/wall-framing-takeoff/water-supply-sizing-calculator.html) that works Hunter's rule out directly instead of reading it off a table.

## What it does

You type each kind of fixture: its flow while running, minutes per use, and uses in the busiest hour. Its busy fraction is p = minutes x uses / 60. Then you type the pipe runs as a tree from the meter, each with its length, rise, the equivalent length of its fittings, and the fixtures at its end.

For each run, the total flow of the fixtures it feeds is a sum of independent binomials, one per fixture type. The engine builds that distribution exactly, by convolution on a 0.01 gpm grid, and takes the 99th percentile (or whichever percentile you type). It then picks the smallest copper, PEX or CPVC size within your velocity limit, works out the pressure loss with Darcy-Weisbach and the Colebrook friction factor, and walks the pressure from the meter to every fixture. Where a fixture would fall below the pressure you need, it upsizes the run on that path that buys the most pressure per foot of bigger pipe.

## The normal approximation is not close enough for one house

A common shortcut takes the mean plus 2.33 standard deviations, which is the normal approximation to the same 99% point. It holds up for big buildings but not for a house:

| Bathrooms fed (two sinks, toilet, shower each) | All on | Exact 99% | Normal approximation |
|---|---|---|---|
| 1 | 8 gpm | 5 gpm | 4.11 gpm (18% low) |
| 4 | 32 gpm | 11.5 gpm | 10.28 gpm |
| 64 | 512 gpm | 92 gpm | 90.73 gpm (1.4% low) |

On the page's worked example, a two-bath house on copper type L, the approximation gives 10.76 gpm for the main. That fits 3/4 in pipe under an 8 ft/s limit. The exact 12.2 gpm runs at 8.1 ft/s in 3/4 in, so the main comes out 1 in. For a single house the size you pick can depend on which method you use.

## How it was checked

- The convolution agrees with brute-force enumeration of every on/off pattern on 60 random fixture mixes.
- A 200,000-draw Monte Carlo of the example house gives the same 99th percentile.
- The Colebrook residual is below 1e-9, and the friction factor is within 3% of Swamee-Jain. Loss is within 15% of Hazen-Williams with C=150.
- The test walks every path again independently from the typed numbers and re-derives each pressure.
- A 150-tree fuzz test checks that every input is either refused with a reason or gives finite numbers that tie out.

## What it is not

It is not the IPC or UPC fixture-unit tables, and those are what an inspector checks. Every usage figure is yours to type. The example's minutes per use and uses per hour are illustrative, not measured. Bores use the minimum wall, so the loss is slightly optimistic for real tube; you can type your maker's bore instead. Upsizing is a greedy rule, not a cost optimum. Drain and vent sizing is still unchecked.

Next steps: hook the sizing into the takeoff's `plan.plumbing` and CLI, then add drain sizing.
