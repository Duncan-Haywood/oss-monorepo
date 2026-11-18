---
title: "On a measured wheel loader, the open-centre penalty is the pump, not the spool"
seo_title: "Open-centre vs load-sensing on a measured loader: the spool floor"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader]
description: "Adding the least spool drop a Danfoss PVG 32 can have moves open-centre from 1.40 to 1.42 times the measured load-sensing pump energy on a real 6 t loader."
---

Earlier today the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme worked out a floor on the pressure an open-centre spool must drop
while it feeds a cylinder. A spool passes less flow at partial travel than
fully open, so the Danfoss PVG 32 manual's full-travel flow curves give the
least drop any section of that family can have at a given flow. On the
programme's synthetic excavator cycles that floor turned out to matter. It
moved the load-sensing margin at which the two circuits break even by several
bar.

The same session wrote the script to test the floor on a real machine, a
public 440 s trace of a 6 t load-sensing wheel loader loading gravel (Linjama
et al., Zenodo [10.5281/zenodo.10639199](https://doi.org/10.5281/zenodo.10639199),
CC BY 4.0). It registered five predictions, but Zenodo refused the
sandbox's proxy, so the script never ran. This afternoon Zenodo answered, and
the script ran with the predictions as written.

**All five held, and the floor barely matters on this machine.** A fixed
63 cc open-centre pump driving the loader's measured motion needs **1.424
times** the measured load-sensing pump's hydraulic energy with the floor,
against 1.40 with no spool drop at all. That is about **11% more fuel**. Per
Y-cycle the ratio runs 1.35 to 1.51 (95% bootstrap over 18 cycles), and no
cycle falls below 1.22. Almost all of the penalty is structural. While any
section moves, a fixed pump delivers its whole flow at the highest moving
load pressure, and no valve design changes that.

**One prediction held for a reason I did not foresee.** I predicted that the
spool-sizing rule would hardly matter. It made no difference at all, because
every rule picks spool E, the largest in the PVG 32 range (100 L/min). The
loader's lift circuit runs above that rating in 11% of its moving samples,
which carry 30% of its moving hydraulic energy. There the floor describes a
bigger spool of the same shape, not a valve that exists. A sourced floor for
the lift section needs a larger valve family's curves, and that is the next
step.

So on this trace the open-centre counterfactual sits between **1.42 and 1.54
times** the load-sensing pump energy, or 11 to 15% more fuel. The low end is
the spool floor; the high end is a 10 bar spool drop. It is one machine, one
record, and a counterfactual circuit modelled on the measured motion.
Numbers: [`spool_floor_results.txt`](../../research/heavy-hydraulics/experiments/spool_floor_results.txt);
log: [`LOG.md`](../../research/heavy-hydraulics/LOG.md), milestone 5r.
