---
title: "A short battery simulation cannot tell a plating forecast its exponent on LG M50, but a longer line fit can"
seo_title: "How many DFN cycles a lithium-plating forecast needs"
date: 2026-11-17
tags: [research, batteries, pybamm, lithium-plating, digital-twin]
description: "Read from 10 to 30 PyBaMM DFN cycles, the plating exponent is 2 to 3 times too high on LG M50; fitting the law over 30 to 50 cycles cuts its error to 2%."
---

The [cell-fidelity](../../research/cell-fidelity/) programme forecasts how
much lithium a battery electrode design loses to plating over 100 cycles
from a short run of the full DFN model. The forecast is a kinetic law with
one exponent. The physical value, &alpha;F/RT = 25.3 per volt, is too
shallow on the LG M50 cell, and the
[previous milestone](2026-11-17-what-sets-the-plating-exponent-in-battery-models.md)
series ended with a mechanism: the exponent the forecast needs is 25.3 times
the ratio of the open-circuit potential rise *where the plating happens* to
the law's own potential lever. Read over 100 cycles, that ratio lands within
3 to 12% of the needed exponent on three of four PyBaMM cell models.

That was a diagnosis, because it reads cycle 99. Milestone 5zm asked the
question a design search cares about: how many cycles does the ratio need
before it can be trusted?

## How it was tested

No new simulation. The same 40 DFN designs (PyBaMM 26.10.1.1, four parameter
sets, SEI and plating, 100 cycles each), whose per-node potentials and
plating currents were already committed. For a budget of k cycles (10, 20,
30, 50), the ratio was fitted over cycles 3 to k only, and two forecasts of
the cycle-99 loss were given the same k cycles: the law at the early
exponent, and the law at the physical 25.3. Four hypotheses and their
thresholds were committed before any early-window number was computed.

## What it found

| set | needed exponent | read at 10 cycles | at 30 | at 99 |
|---|---|---|---|---|
| `Chen2020` (LG M50) | 36.6 | 100 (clamp) | 98.2 | 37.7 |
| `OKane2022` (LG M50) | 32.3 | 48.7 | 75.0 | 34.2 |
| `Ai2020` | 18.8 | 43.1 | 24.0 | 25.2 |
| `NCA_Kim2011` | 23.6 | 29.4 | 27.4 | 26.4 |

(Set medians, 8 to 12 designs each.) On LG M50 the early reading is two to
three times too high, and a forecast built on it loses to plain physics. Over
all four sets the early exponent lost on 4 of 4 at ten cycles and on 3 of 4
at thirty. Two hypotheses were refuted and two came out inconclusive.

The reason is in the shape, not the noise. While the LG M50 graphite sits on
its voltage plateau at top of charge, the law's lever barely moves (0.4 mV
by cycle 10 on `Chen2020`). Inside the electrode, where most of the plating
is, the potential has already risen 2.9 mV. The ratio starts near 6 and
falls toward 1.2 as lost lithium pushes the law's window off the plateau.
So the 100-cycle ratio is an average over a changing path, dominated by late
cycles, not a constant of the design that early cycles reveal. On
`NCA_Kim2011`, with no plateau at top of charge, the ratio is flat from
cycle 10.

## The practical answer

The comparison held one plain result that nobody had hypothesised: give the
law at the physical exponent more cycles to fit its line, and it gets better
on every set. The cycle-99 lithium-loss error goes from 8.2% at ten cycles
to 4.6% at thirty and 2.0% at fifty on `Chen2020`, and from 5.9% to 1.7% on
`OKane2022`. A search that can afford 30 to 50 DFN cycles per finalist does
better that way than with any early exponent tested here.

The next mechanism step is a lever that knows about the plateau: read the
potential at the plating-weighted stoichiometry on the open-circuit curve,
and check it against the falling ratio measured here.

Limits: 40 designs already seen by earlier milestones, one PyBaMM version,
node potentials that are a model internal rather than a cell measurement,
and modelled fade only. Code, data and the log are in the
[project directory](../../research/cell-fidelity/); this step's output is
`experiments/horizon10/`.
