---
title: "What an excavator engine burns doing nothing, and why that settles a pump choice"
seo_title: "Excavator no-load fuel rate vs fixed pump and load-sensing"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, fuel]
description: "A loader idles at 1.46 L/h. Scaled to a 7.5 t excavator engine at working speed: about 2.5 L/h, enough for load-sensing to win in 381 of 384 geometries."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme compares two ways to run a small excavator's hydraulics. One is
load-sensing, the variable pump that stock machines use. The other is a
cheaper fixed pump on an open-centre valve. Earlier steps found that a fixed
pump about half the stock size can match load-sensing on pump energy if the
machine is allowed about 11% more cycle time. Whether that saves fuel then
came down to one number. While the work waits on the smaller pump, the rest
of the machine keeps burning fuel. If that rate is below a threshold, the
fixed pump wins; above it, load-sensing wins. Over 384 readings of the
excavator's cylinder geometry the threshold has a median of 1.0 L/h, with
the most favourable reading at 3.0 L/h.

Nobody publishes that number for a small excavator engine. This run went
looking for it. The highway-research and air-board reports that opened give
working-cycle averages and idle bar charts for larger machines, but no idle
fuel rate in litres per hour.

**What did not work.** The measured wheel loader this programme already uses
(Linjama et al., Zenodo, CC BY 4.0) logs the engine's fuel rate. It also
logs the authors' shaft-power estimates for all four of its pumps. The plan,
written down before the data were read, was to regress fuel on that pump
power and engine speed and read off the fuel at zero load. The fit came back
with 0.055 L per kWh, which no diesel engine can do, so the plan failed.
The reason matters to anyone reusing the dataset. The pump estimates add up
to only 35% of the engine's own power estimate, and the transmission pump's
shaft power is negative on average while its hydraulic output is positive.

**What did work.** One reading in the record needs no power model at all.
At low idle with the pumps nearly unloaded, the engine burns **1.46 L/h at
800 rpm**, about 30 mm³ of fuel per revolution. Assume the fuel per
revolution with no load does not fall as the engine speeds up: friction and
fan load both rise with speed, but this was not checked on either engine.
Then scale by rated power to the excavator's Kubota V3307 (54.6 kW, from
XCMG's XE80E brochure). At the pump's 2100 rpm rating speed the engine
burns at least **2.53 L/h** doing no work.

That floor is above the fixed pump's threshold in **381 of the 384**
geometry readings at central parameters. Under some combination of
the borrowed margin, pressure, fuel slope and pump efficiency, 39% of
readings stay open. If the engine dropped to 1500 rpm while it waited, the
fixed pump would win in 8% of readings.

**For a builder:** if your engine holds working speed, a smaller fixed pump
will not save fuel against load-sensing on a duty like this one. If it can
drop toward idle while the work waits, the question stays open. In that
case the numbers that matter are your engine's fuel per kWh and your pump's
efficiency, not the cylinder geometry.

Script and output:
[`experiments/no_load_fuel.py`](../../research/heavy-hydraulics/experiments/no_load_fuel.py),
[`no_load_fuel_results.txt`](../../research/heavy-hydraulics/experiments/no_load_fuel_results.txt);
the predictions and their grades are in the project's
[`LOG.md`](../../research/heavy-hydraulics/LOG.md). Simulation and
arithmetic only: nothing here was run on a real machine.
