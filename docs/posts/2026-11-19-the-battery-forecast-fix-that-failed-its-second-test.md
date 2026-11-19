---
title: "A battery plating-forecast fix that failed its second held-out test"
seo_title: "Lithium-plating forecast fix fails a second held-out test"
date: 2026-11-19
tags: [research, batteries, pybamm, lithium-plating, negative-result]
description: "A thickness-line correction that helped a ten-cycle lithium-plating forecast on 32 new battery designs did not hold on 32 more. Here is why."
---

Yesterday's step in the [cell-fidelity](../../research/cell-fidelity/)
programme tested a correction to a ten-cycle forecast of how much lithium a
battery design loses by cycle 99, mostly to lithium plating. The correction
is a straight line, per point through the anode's thickness, of how much
that point's open-circuit potential lags the uniform shift the forecast
assumes. On 32 designs it had never seen, it gave the lowest median error
on three of four parameter sets. But its two worst misses sat at the thin
end of the training range, where a line extrapolates.

So today's step tried the obvious repair and tested it on another 32
fresh designs. The line was fitted on all 72 designs simulated so far, not
40. It was used only when a new design's anode thickness fell inside the
training range, with the plain uniform lever as the fallback otherwise.
The plan and four hypotheses were committed before any new simulation ran.

## What came out

Set-median error in the cycle-99 lithium-loss forecast, on the 32 new PyBaMM
DFN designs (8 per set, 100 cycles each):

| set | uniform lever | line, 40 designs | line, 72 designs | line in range | measured-OCP lever |
|---|---|---|---|---|---|
| `Ai2020` | 1.2% | 2.6% | 3.4% | 3.4% | 8.5% |
| `Chen2020` | 4.5% | 5.4% | 4.7% | 4.7% | 7.0% |
| `OKane2022` | 5.1% | 6.5% | 6.2% | 6.2% | 4.6% |
| `NCA_Kim2011` | 5.3% | 4.8% | 4.7% | 3.7% | 0.7% |

The repair did not work. The range-restricted line beats the uniform lever
on one set of four, `NCA_Kim2011`. Design by design it wins 14 of the 29
designs inside the range, a coin flip. Over both fresh pools the line wins
33 of 64. Three of the four hypotheses were refuted. The one that held is
that more training designs make the line itself a bit better (three sets of
four), and that was not enough.

## Why

The last column is the telling one. It replaces the uniform lever with each
design's *own* measured anode potential rise, which no ten-cycle forecast
could know. If the lever were the forecast's main error, that column
would be the floor. On this pool it beats the uniform lever on only 14 of
32 designs. On `Ai2020` and `Chen2020` it is worse at the median. So on
three of the four sets, getting the lever right does not fix the forecast:
other terms dominate, and errors in the lever cancel them as often as they
add. `NCA_Kim2011` is the exception on every pool so far. There the lever
*is* the error (0.7% with the measured lever), and a borrowed profile
helps.

The previous step's gains on three sets were, it now seems, mostly the luck
of one draw of eight designs per set. That is exactly what a second
pre-registered draw is for.

## What it means for a design search

Do not correct a ten-cycle plating forecast with a node-gain profile
borrowed from other designs, except perhaps on cells like `NCA_Kim2011`
where the anode's potential rise is the dominant error. Fit the forecast's
line through 30 to 50 cycles instead. This closes the node-profile thread
of the programme (five steps). Next is the error budget on all 104 designs
simulated with through-thickness records, to name what does limit the
forecast on the other three sets.

Code, data and the full log:
[`research/cell-fidelity`](../../research/cell-fidelity/) (milestone 5zz in
`LOG.md`; figure `experiments/rangeline/rangeline.svg`). These are model
results from one PyBaMM version, not measured cells.
