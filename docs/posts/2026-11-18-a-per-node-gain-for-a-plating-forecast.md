---
title: "Calibrating each anode node's lag from ten cycles helps one battery set and not the one that needed it"
seo_title: "A per-node gain for a ten-cycle plating forecast"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, negative-result]
description: "A per-node gain fitted on cycles 3 to 10 takes Chen2020's cycle-99 plating forecast from 5.4% to 3.9% but leaves OKane2022 at 6.9% against 6.7%."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery design loses to plating by cycle 99 from a ten-cycle
simulation. [The last milestone](2026-11-18-an-error-budget-for-a-ten-cycle-plating-forecast.md)
built an error budget and found that on the `OKane2022` LG M50 parameters
most of the remaining 6.7% error comes from one input: the rise of the
anode's open-circuit potential (OCP) at the nodes where plating happens.

The forecast gets that rise from a "node lever". It assumes every node in
the anode loses lithium at the same rate, a uniform shift in stoichiometry,
and reads the OCP curve at each node's starting point. An earlier step had
found that this lever over-reads at the separator side of the anode, which
is where most of the plating is.

## The idea

If a node's local stoichiometry moves more slowly than the uniform shift,
cycles 3 to 10 should already show it. So for each of the 20 anode nodes I
fitted one gain on the shift, the number that best matches that node's
measured OCP rise over those eight cycles. A gain of 1 is the old lever. The
fit runs in OCP space so the graphite plateau's flat steps can't blow it up.
Nothing past cycle 10 is read. The hypotheses were written down and
committed before any gain was computed
([`LOG.md`](../../research/cell-fidelity/LOG.md), 5zv).

## What happened

On `OKane2022` the gains came out well below 1, between 0.1 and 0.8, with a
plating-weighted mean of 0.61. Over ten cycles the nodes really do lag the
uniform shift. Carried out to cycle 99, though, that ratio over-corrects. The
gain lever now under-reads the cycle-99 OCP rise by 14.8 mV, where the
uniform lever was 5.9 mV off, and the lithium-loss forecast ends up 6.9%
off against 6.7%. Both `OKane2022` hypotheses are refuted.

On `Chen2020`, the other LG M50 set, the same method works. The forecast
goes from 5.4% to 3.9%, which is as good as feeding it the measured OCP
rise. `NCA_Kim2011` improves too, from 3.0% to 2.3%. Across all 40 designs,
22 improve. That is short of the 26 the sign test needed.

| set | uniform lever | per-node gain | measured OCP (ceiling) |
|---|---|---|---|
| `Ai2020` | 2.3% | 2.5% | 3.5% |
| `Chen2020` | 5.4% | 3.9% | 3.9% |
| `OKane2022` | 6.7% | 6.9% | 3.5% |
| `NCA_Kim2011` | 3.0% | 2.3% | 1.0% |

*Set-median error in cycle-99 lithium loss, at the physical exponent, line
through cycles 2 to 10.*

## A lead, not a fix

I also reported a variant with gains on the four separator-side nodes only
and a gain of 1 everywhere else. It takes `OKane2022`'s set median to 4.1%,
close to the 3.5% ceiling. But it improves only 6 of the 12 designs, it makes
`Chen2020` worse (6.9%), and it wasn't one of the hypotheses. It needs a
pre-registered test on fresh designs before anyone calls it a fix.

The reading is that a node's lag is not a constant fraction of the shift. It
is large early and relaxes later. A straight-line drift forecast failed the
same way two milestones ago. The next step is a gain that relaxes as lithium
is lost. For an actual design search the advice doesn't change: fit the
forecast's line through 30 to 50 cycles instead of 10.

Everything here is modelled fade in one PyBaMM version (26.10.1.1), on 40
designs the programme has seen before, and the node OCPs are model
internals, not anything you could measure on a real cell.
Figure: [`nodegain.svg`](../../research/cell-fidelity/experiments/nodegain/nodegain.svg).
