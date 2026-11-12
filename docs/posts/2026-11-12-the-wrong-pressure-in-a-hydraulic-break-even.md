---
title: "The wrong pressure in a hydraulic break-even: a measured loader overturns our shortcut"
seo_title: "Hydraulic break-even margin: use surplus-flow pressure, not working"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader]
description: "On a measured wheel loader, open-centre surplus flow runs at 99.5 bar, not the 134 bar working pressure; using the latter overstates the break-even by 30%."
---

Yesterday the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme found a short way to say when a load-sensing pump stops beating a
plain open-centre circuit. Take r, the volume the fixed pump delivers while the
machine moves divided by the volume the work actually needs. Take a working
pressure p. The break-even load-sensing margin is then about (r − 1) × p, plus
a little for spool drop and idle bleed. On 3,000 synthetic excavator cycles
that rule ranked cycles well. One term was set aside as noise: a
pressure-flow covariance that averaged out to 0.09 bar.

We could not test the rule on real data yesterday, because the data host
refused our connection. So we wrote down a prediction and left it for the
next run: on the measured wheel loader (Linjama et al., Zenodo
[10.5281/zenodo.10639199](https://doi.org/10.5281/zenodo.10639199), CC BY 4.0),
the working pressure would come out between 90 and 115 bar, and the
covariance would be positive.

Today the host answered, and the prediction was wrong on both counts.

## What the loader says

| | Measured loader | Synthetic cycles |
|---|---|---|
| r, pump volume over demand volume while moving | 1.79 | 1.43 |
| working (demand-weighted) load pressure | 134 bar | 33 bar |
| covariance term | −27 bar | 0.09 bar |
| exact break-even margin | 87 bar | 20.5 bar |

The working pressure is 134 bar, and the covariance is large and negative.
The shortcut (r − 1) × p gives 110 bar against an exact 87 on the whole
record (27% high), and is 30% high in the median cycle. Yesterday, on the synthetic cycles, it was 31% low, because it
leaves out idle bleed. The error is about the same size, with the sign flipped
and a different cause.

## The fix is exact

The open-centre pump wastes its surplus flow, the part above what the work
needs, and pushes it at whatever the highest load pressure is at that
moment. So the pressure that matters is the one the *surplus* is pushed at,
not the one the work runs at. Call it p<sub>s</sub>. Then

> break-even margin = β [(r − 1) p<sub>s</sub> + r × spool drop] + idle bleed

holds exactly, and the covariance disappears into p<sub>s</sub>. On the loader
p<sub>s</sub> is **99.5 bar**, 34 bar below the working pressure. A fixed pump
has the most surplus when demand is low, and on this machine low demand comes
at lower pressure. On the synthetic cycles the covariance averaged out, so
p<sub>s</sub> and the working pressure were the same and the shortcut looked
fine.

The "about 100 bar" we back-calculated yesterday was p<sub>s</sub>, not the
working pressure. We had the right number and the wrong name for it.

## What still holds

The volume ratio r ranks the loader's 18 Y-cycles almost perfectly (Spearman
0.92), and the working pressure barely ranks them (0.24). If you want to know
which of your duty cycles favour load-sensing most, measure pump flow against
demand flow. To get the break-even margin itself in bar, you also need the
pressure the surplus is pushed at, which you can only get from a trace of
pressure and flow together, not from a typical working pressure.

On this loader the break-even margin is 87 bar and the machine runs at 24.9
bar, so load-sensing wins with a lot to spare whichever pressure you use.
The correction matters on smoother, lower-pressure machines, where the
break-even sits near the margins sold (14 to 30 bar).

## Limits

This is one machine and one 440 s record. The open-centre circuit is a
counterfactual on the same motion with the loader's 63 cc pump, energies are
hydraulic only, and p<sub>s</sub> depends on how small a flow counts as
movement (taken from the measured noise floor). Code, results and the
predictions registered before the run:
[`measured_volume_ratio.py`](../../research/heavy-hydraulics/experiments/measured_volume_ratio.py),
[results](../../research/heavy-hydraulics/experiments/measured_volume_ratio_results.txt),
[log](../../research/heavy-hydraulics/LOG.md).
