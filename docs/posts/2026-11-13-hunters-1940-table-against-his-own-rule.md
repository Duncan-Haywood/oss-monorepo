---
title: "Hunter's 1940 water-demand table, checked against his own 1% rule"
seo_title: "Water pipe sizing by Hunter's method, worked exactly: free calculator"
date: 2026-11-13
tags: [water-supply-sizing, plumbing, probability, construction]
description: "We rebuilt Hunter's 1940 water-demand method, matched his printed table, found where it is looser than his own 1% rule, and shipped a free pipe sizer."
---

Every US plumbing code's water-supply fixture-unit table descends from one
report: Roy B. Hunter, *Methods of Estimating Loads in Plumbing Systems*,
National Bureau of Standards BMS65, December 1940
([NIST scan](https://nvlpubs.nist.gov/nistpubs/Legacy/BMS/nbsbuildingmaterialsstructures65.pdf)).
His idea fits in two lines. A fixture that draws *q* gpm for *t* seconds once
every *T* seconds is running with probability *p = t/T* at a random instant.
With *n* such fixtures, the number running is binomial. Size the pipe for the
number *m* that is exceeded no more than 1% of the time.

Today's run rebuilt that model from the paper, in a new free tool:
[water supply pipe sizing](../../ventures/water-supply-sizing/). This is what
checking it against the original turned up.

## His table reproduces

Hunter's Table 1 gives the busy-period inputs: flush valves 9 s in 300 s at
27 gpm, flush tanks 60 s in 300 s at 4 gpm, bathtubs 60 s in 900 s at 8 gpm.
His Table 2 lists, for each design number *r*, the group size *n* where he
steps up to it and the probability of exactly *r* running there. Our
probability function, computed in logarithms, matches his printed value to
the fourth decimal in 13 of the 14 legible rows. The odd one out is 31
bathtubs: we get 0.0115, the paper prints 0.0118. That is a hand-calculation
slip on one side or the other, or a misprint. (The flush-tank column is
garbled in the scan's text layer, so we left it out.) At every tabulated *n*,
the exact rule gives his *m*.

## But the exact rule steps up sooner

Hunter's text sets the criterion as the count that is "not exceeded more than
1 percent of the time". That is a tail: P(more than *m* running) ≤ 1%. His
table steps up when P(*exactly* *r* running) reaches 1%. He justified the
substitution with a series bound: the terms past *m* shrink at least by half
each step. The bound is close for small groups and drifts for large ones:

| Flush valves, design number | Hunter's table steps up at | Exact 1% tail rule needs it from |
|---|---|---|
| 4 | 30 | 29 |
| 6 | 66 | 62 |
| 8 | 107 | 99 |

At 106 flush valves the table still says 7. The chance that more than 7 are
running is 1.47%, not 1%. Bathtubs show the same pattern (9 tubs from 55, not
59). It is one fixture's flow at most. Next to how rough "once every five
minutes" is as a model of a 1930s office, it does not matter. Still, it is a
small, checkable gap between the method as stated and the method as printed,
and we had not seen it noted. The tool follows the stated rule, and a test
pins the whole comparison table to the engine.

## Mixing fixtures without fixture units

Hunter handled a mix of fixture types by converting each to "fixture units",
weights read off his curves, which is where the code tables come from. A
computer does not need the weights. Each type's flow is *q* times a binomial
count, the types are independent, so the total flow's distribution is just
their convolution. The tool computes it on a 0.1 gpm grid and reads off the
flow exceeded 1% of the time (or whatever share you choose). A brute-force
enumeration test checks the convolution.

The difference is large. In the tool's example two-bath house, with
illustrative timings (they are assumptions, not measurements), the service
pipe works out as follows:

- every fixture open at once: 31.3 gpm;
- each type sized on its own by Hunter's single-type rule, then added: 25.3 gpm;
- the mix worked as one distribution: 10.8 gpm.

Adding per-type peaks assumes the rare busy moment for showers is also the
rare busy moment for toilets and the kitchen. That is what makes the sum of
separately sized peaks so pessimistic.

## Then the pipe

The demand feeds a pipe tree. Each segment carries the fixtures it feeds and
everything beyond. The tightest path's pressure budget sets one allowable
friction rate: static pressure, less meter and backflow losses, the minimum
at the fixture and 0.433 psi per foot of rise, divided by developed length.
In the example that is 15.22 psi per 100 ft. Each segment then gets the
smallest copper or PEX size within that rate and the velocity limit
(Hazen-Williams; inside diameters from the ASTM B88 outside diameter and
wall), and the tool walks every path to report the pressure left at each
fixture.

There is one more step, which code tables cannot take because they never see
the pressures. The uniform friction rate comes from the worst path, so every
shorter path has pressure to spare. With **Trim** switched on, the tool steps
segments down a size, longest first, while every end still holds the minimum.
In the example, both upstairs bath branches drop from 3/4 in to 1/2 in, and
the hall bath still gets 24.2 psi against a 20 psi minimum.

## What it is not

It is not your code's fixture-unit table, and an inspector may require that
table. Fixtures are treated as independent, Hazen-Williams is a cold-water
correlation, and fittings are a percentage allowance. The disclaimer on every
page says so. What it adds is the model behind the table, worked exactly for
your fixtures. You can see why a pipe is the size it is, and how much pressure
is left at the far shower.

Next, if people use it: a hot-water branch with a recirculation loop, and a
side-by-side with a published modern probabilistic method for houses, where
Hunter's congested-building timings are known to oversize.
