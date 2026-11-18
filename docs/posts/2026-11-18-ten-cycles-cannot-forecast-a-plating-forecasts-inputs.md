---
title: "Ten battery cycles can't hand a plating forecast its two missing inputs, at least not by straight lines"
seo_title: "Ten cycles can't forecast a plating law's inputs"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, negative-result]
description: "Extrapolated from cycles 2 to 10, the plating overpotential drift and charge-capacity factor keep little of the oracle's gain: 5.7 to 10.1% cycle-99 error."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts the
lithium a battery design loses to plating by cycle 99, using a ten-cycle
simulation. [The last milestone](2026-11-18-what-bends-a-plating-forecasts-line.md)
found that the forecast law is close to right on LG M50 cells if you give it
two inputs measured in the full simulation: the part of the plating
overpotential that isn't the anode's open-circuit potential, and the charge
the cell actually delivers each cycle. With both, the error was 1.4 to 1.5%.

Both of those inputs were read up to cycle 99, though, so that was a diagnosis
and not a forecast. This step asked the obvious follow-up. Can the first ten
cycles predict those two inputs well enough to keep the gain?

## The simplest test

For each of the same 40 PyBaMM DFN designs I fitted a straight line, through
cycles 2 to 10, to each input as a function of lithium lost:

- the overpotential drift (the plating overpotential's rise minus the OCP's
  rise), added to the node lever from milestone 5zn;
- the capacity factor, which is the charge at cycle 2 divided by the charge
  at cycle n.

I then ran the same ten-cycle forecast with these lines in place of the
measured inputs. The four hypotheses were committed before any of it ran.

## What came out

Set-median error in cycle-99 lost lithium:

| parameter set | law's own lever | node lever | ten-cycle lines (F) | both measured (5zp) |
|---|---|---|---|---|
| `Chen2020` (LG M50) | 8.2% | 5.9% | 5.7% | 1.4% |
| `OKane2022` (LG M50) | 5.9% | 7.6% | 7.2% | 1.5% |
| `NCA_Kim2011` | 2.2% | 4.8% | 10.1% | 1.1% |
| `Ai2020` | 8.3% | 2.3% | 7.0% | 8.0% |

The forecast beats the law's own lever on 15 of 40 designs. The pre-registered
bar was 26, and 20 or fewer counted as refuted, so that hypothesis is
refuted. On `Chen2020` it closes about a third of the gap to the oracle. On
`OKane2022` it makes things worse.

## Why straight lines fail

**The capacity factor accelerates.** At cycle 99 the ten-cycle line gives 1.20
to 1.59. The simulation gives 1.53 to 2.00. The line under-reads on every set,
because the delivered charge falls faster in lithium lost after cycle 10 than
before it. Putting that line into the law's own lever made LG M50 worse
(8.2% to 15.0% on `Chen2020`). The law's own capacity term already rises
faster than the line does.

**The overpotential drift turns over.** On LG M50 it grows over the first
ten cycles, to about +0.3 to +0.6 mV, then reverses: by cycle 99 it is about
−2.5 mV. A line through the origin can't follow that, so it forecasts the
wrong sign. The drift is small next to the 30 mV OCP rise, but it sits inside
an exponent with a factor of 25.3 per volt, so small errors still count. The
plan named this risk in advance, and it happened.

## What it means

The previous milestone's diagnosis still holds: on LG M50 the law's form is
fine once it gets the right inputs. But those inputs aren't linear over the
first ten cycles, so no short extrapolation will supply them. For a design
search the practical advice hasn't changed: fit the law's line through 30 to
50 cycles.

The capacity factor is the bigger failure, and it is also the one with a
physical model available. The electrode-balance map from
[milestone 5r](../../research/cell-fidelity/LOG.md) predicts from the design
alone how the voltage window shrinks as lithium is lost. Feeding the law that
map's capacity curve, in place of a straight line, is the next step.

Limits: 40 designs, all seen in earlier milestones; the simplest possible
forecasts, not the best; node-level overpotentials are model internals; one
PyBaMM version; modelled fade, not a tested cell. Numbers, code and the
pre-registration are in the programme's
[log](../../research/cell-fidelity/LOG.md) and
[`experiments/drift/`](../../research/cell-fidelity/experiments/drift/).
