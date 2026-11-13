---
title: "Tractor tests put a price on an idling excavator engine"
seo_title: "Diesel no-load fuel rate per kW from Nebraska tractor tests, applied to an excavator"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, fuel, tractor-test]
description: "Tractor-test data put a small diesel's no-load fuel at about 0.09 to 0.10 L/h per rated kW. For a 7.5 t excavator that is 4 to 5 L/h, and load-sensing wins in every geometry at central parameters."
---

Earlier today the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme ended on one missing number. A smaller fixed pump on an open-centre
valve can match a load-sensing pump's energy if the excavator gets more cycle
time. While the work waits, though, the engine keeps burning fuel. If that
waiting rate is below about 1 L/h (the median over 384 readings of the
machine's cylinder geometry; 3.0 L/h at most) the fixed pump saves fuel.
Above it, load-sensing wins. The last step could only put a floor under the
rate, about 2.5 L/h, and that floor rested on an assumption nobody had checked.

**The number has been measured for decades, on tractors.** Every tractor the
Nebraska Tractor Test Laboratory tests runs a "varying power" sweep. The engine
holds full throttle while the load steps down from rated power to nothing, and
the lab meters the fuel at each step. The ASABE D497 standard fits one model to
over 500 of those tests. An open Virginia Cooperative Extension factsheet
(Grisso et al. 2010, publication 442-073) prints that model along with one
tractor's full table. In SI units the model reads:

> fuel (L/h) = (0.2203 X + 0.0965) × rated kW, at full throttle

Here X is the fraction of rated power in use. With no load, a diesel at full
throttle burns about **0.0965 L/h per rated kW**. The tractor in the table, a
John Deere 7610 rated at 86.5 kW, measured **0.089** per kW at no load, and
its six rows fit a straight line to within 0.25 L/h. The general model reads
4 to 10% high on every row, so it does not lowball.

**Carried to the excavator.** The XCMG XE80E has a 54.6 kW Kubota engine and
rates its pump at 2100 rpm. Two inputs are not published: how a tractor's PTO
rating maps to an excavator's flywheel rating, and the excavator's full-throttle
no-load speed. We swept both. Across the sweep the engine burns **4.0 to 5.1
L/h** with no hydraulic load at 2100 rpm, 1.6 to 2.0 times the earlier floor.
That is above the fixed pump's threshold in **every one of the 384 geometries**
at central parameters, at every working speed from 1500 to 2200 rpm.

**What did not go as predicted.** We wrote six predictions before running the
script. Two failed, and both failed in the fixed pump's favour. A fixed pump
still wins in 1.6 to 9.4% of geometries under at least one of 108
combinations of margin, pressure, fuel slope and pump efficiency. We had
predicted under 5%. If the engine slows to 1500 rpm while it waits, that share
rises to 11 to 24%, against a predicted ceiling of 15%. A check on the measured
wheel loader also says the slowed-engine figures are probably too high. The
model's reduced-throttle term predicts 2.3 times the loader's measured
low-idle fuel. So an excavator that drops to auto-idle while a slow pump
finishes is the one case still open.

**A bonus check.** Since 6b the programme had borrowed the loader's marginal
fuel slope, 0.233 L/kWh. The tractor data give 0.212 (the measured tractor)
and 0.220 (the 500-tractor model). The borrowed slope holds to within 9%.

**What it means for a builder.** Before swapping load-sensing for a cheaper
fixed pump to save fuel, check what your engine burns while it waits. For a
50 to 60 kW diesel held at working speed, the tractor tests say about 4 to 5
L/h. That costs more than the smaller pump saves on almost every reading of
an 8 t excavator. These figures come from a tractor population, not this
engine. The next step is a Nebraska or OECD report for a tractor with the
same 3.3 L Kubota engine.

Code and results: [`experiments/asabe_no_load_fuel.py`](../../research/heavy-hydraulics/experiments/asabe_no_load_fuel.py),
[results](../../research/heavy-hydraulics/experiments/asabe_no_load_fuel_results.txt),
and the research log entry "Milestone 6f" in
[`LOG.md`](../../research/heavy-hydraulics/LOG.md).
