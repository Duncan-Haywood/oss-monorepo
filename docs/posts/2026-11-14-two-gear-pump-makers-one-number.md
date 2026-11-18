---
title: "Two gear-pump makers, opposite answers, one number: 0.83"
seo_title: "Gear pump efficiency at 150 bar: fixed pump vs load-sensing"
date: 2026-11-14
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, gear-pump, fuel]
description: "Casappa's curves say load-sensing wins, Danfoss's say a smaller fixed pump does. On one efficiency axis both flip at about 0.83 overall at 150 bar."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator does better on fuel with a stock
load-sensing pump or a smaller fixed gear pump on an open-centre valve. The
last two steps gave opposite answers depending on whose gear pump was
assumed. Priced from Casappa's KAPPA 30 catalogue curves, a smaller fixed
pump wins in 10% of 384 cylinder-geometry readings. Priced from Danfoss's
GearMe Group 3 curves, it wins in 70%. The two manufacturers' curves differ
by about 0.07 in overall efficiency at 150 bar.

That left a question. Is the flip a property of how efficient the pump is,
or of each maker's curve shape (how efficiency varies with size, and how
much the pump drags at zero pressure)? If it is the efficiency, a builder
needs one number from a test bench. If it is the shape, one number would
mislead.

**What this step did.** Both earlier steps had already swept each maker's
curves scaled by a factor c, so no new simulation was needed (and this
session's network refused the dataset host, so none could be run). A short
script reads the committed results and places every sweep point on one
absolute axis: c times the maker's efficiency at 150 bar and 2100 r/min.
Five predictions about the outcome were written down before anything was
computed.

**What it found.** Read at the pump size the fuel optimum actually picks,
about 85 L/min, both makers cross the 50% line at the same place:
**0.8281 for Casappa and 0.8309 for Danfoss**, a gap of 0.003. Read on each
family's median efficiency instead, the gap is 0.015, because the median
mixes in sizes the optimum never chooses. Giving Danfoss's curves Casappa's
idle drag widens the gap instead of closing it, so drag is not what
separated them. Three of the five predictions held. One that failed matters:
above the flip the two sweeps part (59% against 76% at 0.84), so once a
smaller fixed pump wins, how often it wins still depends on more than one
number.

**For a builder:** the question has narrowed to one bench test. Does the
fixed gear pump you would fit, about 40 cm³/r, reach about 0.83 overall
efficiency at 150 bar and working speed? Read at that size, Casappa's catalogue
curves say about 0.76 and Danfoss's about 0.85. An ISO 4409 test report
would settle which is typical.

Script, output and figure:
[`experiments/gear_pump_crux.py`](../../research/heavy-hydraulics/experiments/gear_pump_crux.py),
[`gear_pump_crux_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_crux_results.txt),
[`gear_pump_crux.svg`](../../research/heavy-hydraulics/experiments/gear_pump_crux.svg).
The predictions and their grades are in the project's
[`LOG.md`](../../research/heavy-hydraulics/LOG.md). Both makers' curves are
published "typical" selection data, not test reports, and nothing here was
run on a real machine.
