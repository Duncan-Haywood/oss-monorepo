---
title: "A battery's charge-capacity fade follows its electrode balance, but that doesn't fix the plating forecast"
seo_title: "Charge-capacity fade follows the electrode balance"
date: 2026-11-18
tags: [research, batteries, pybamm, lithium-plating, negative-result]
description: "The electrode-balance window forecasts cycle-99 charge capacity within 4 to 8% from ten cycles, but the plating forecast's error stays: it is the lever."
---

The [cell-fidelity](../../research/cell-fidelity/) programme tries to forecast
how much lithium a battery design loses to plating by cycle 99, using only a
ten-cycle simulation. [The last step](2026-11-18-ten-cycles-cannot-forecast-a-plating-forecasts-inputs.md)
fitted straight lines through cycles 2 to 10 to two of the forecast law's
inputs and found the lines don't hold. The worse of the two was the
capacity factor: the charge the cell takes at cycle 2 divided by what it
takes at cycle n. Its line under-read cycle 99 by 16 to 51%, because the
factor curves upward as lithium is lost.

That curve has a physical reason that is easy to compute. When a cell loses
cyclable lithium, its working window slides along the two electrodes'
open-circuit potential curves. Those curves are not straight, so the window
narrows faster the further it slides. Milestone 5r of this programme already
had that map, from the design and the two curves alone. This step tested it
as the capacity-factor forecast.

## What I did

For the same 40 PyBaMM DFN designs (four parameter sets: `Ai2020`,
`Chen2020`, `OKane2022` and `NCA_Kim2011`), I took each cycle's measured
charge from cycles 2 to 10 and found the overpotential η that shrinks the
open-circuit window to that charge. I fitted a line to η against lithium
lost, then asked the window what charge it would hold at each later amount
of lithium lost. Nothing past cycle 10 went in. The hypotheses and their bars
were [committed before anything was computed](../../research/cell-fidelity/LOG.md).

## The capacity factor: yes

At cycle 99 the window forecast is within 3.6 to 7.6% of the measured factor
on all four sets. The straight line missed by 16 to 51%.

| set | straight line | window, η line | window, η held | measured |
|---|---|---|---|---|
| `Ai2020` | 1.20 | 1.86 | 2.07 | 1.92 |
| `Chen2020` | 1.35 | 1.41 | 1.69 | 1.54 |
| `OKane2022` | 1.34 | 1.40 | 1.64 | 1.53 |
| `NCA_Kim2011` | 1.59 | 1.87 | 2.00 | 2.00 |

The column I didn't expect to matter is "η held". That is the window with the
overpotential fixed at its ten-cycle mean, and it is the forecast law's own
capacity factor. It is within 2.4 to 7.1% of the measured value. So the law
already had the right shape, and the previous step's failure was the
straight line, not the law.

There was a second surprise. I expected resistance growth to push η up and
end each charge earlier. It does the opposite here. η falls by 6 to 18 mV
over the first ten cycles on every set and then levels off, and that is why
the η line ends up low by cycle 99.

## The forecast: no

Fed to the law together with the node lever from milestone 5zn, the window
factor beats the law's own lever on only 14 of 40 designs. Set-median
cycle-99 errors were 2.8% on `Ai2020` (law's lever 8.3%), 5.4% on `Chen2020`
(8.2%), 8.1% on `OKane2022` (5.9%) and 5.7% on `NCA_Kim2011` (2.2%). That is
within half a point to a point of the node lever with the law's own factor.
Getting the capacity factor right changed almost nothing.

So on the LG M50 sets, the error the ten-cycle forecast still has comes from
the lever, the law's driving force for plating, and not from the capacity
factor. The next step is to forecast the plating overpotential's path from
the cell's internal states at cycle 2, not only the anode's open-circuit
potential.

## What this does and doesn't show

The 40 designs were all seen in earlier steps, so this checks a known pool
and isn't a held-out test. η is a symmetric shift of both voltage cut-offs,
which stands in for the real charge overpotential. Everything is modelled
fade in one PyBaMM version. For anyone running a design search with this law,
the practical advice hasn't changed: fit its line through 30 to 50 cycles,
where the error is 1.1 to 3.2%.

Code, results and the full log: [`research/cell-fidelity`](../../research/cell-fidelity/),
`experiments/window/`.
