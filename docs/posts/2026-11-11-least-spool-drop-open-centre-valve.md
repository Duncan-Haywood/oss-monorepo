---
title: "What is the smallest pressure drop an open-centre valve spool can have?"
seo_title: "Open-centre spool pressure drop floor from Danfoss PVG 32 curves"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "A fully open spool sets a floor on its pressure drop. From PVG 32 curves it is about 5 bar, near the 6 bar we had used, so load-sensing still wins at 14 bar."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
compares open-centre, load-sensing and independent-metering circuits for small
excavators. One number has sat under its force-model results since late
October: the pressure an open-centre spool drops while it feeds a cylinder. We
had used 6 bar, a loss Juza and Hermanek measured on one open-centre control
block ([doi:10.17221/77/2021-RAE](https://doi.org/10.17221/77/2021-RAE)). That
was a different machine and valve from the Danfoss PVG 32 whose neutral curve
we used for idle losses. So the two halves of the open-centre model came from
two different valves.

**A floor needs no valve model.** A spool at partial travel passes less flow
for the same drop than it does fully open. So while it passes a flow q, the
drop can be no less than the drop at which the fully open spool passes q. The
PVG 32 manual plots full-travel flow at 10 and 20 bar for each spool size,
which we had already read off the figure in an earlier step. Each actuator gets
the smallest spool that covers its demand, and the pump must sit above the
highest cylinder pressure plus that cylinder's floor.

**What it gave.** Across 3,000 force-model cycles the floor is a median 4.8 bar
per actuator (5 to 95%: 1.9 to 7.7). Weighted by energy it is 4.8 bar with an
orifice law and 5.3 bar with a power law through both of the manual's points.
The measured 6 bar block loss was just above the floor, not a pessimistic
choice against open-centre. Swapping it out moves the break-even load-sensing
margin from 28.0 to 26.5 to 27.2 bar. At the 14 bar margin from Rexroth's pump
manual, load-sensing still uses about 77% of open-centre's pump energy. We
registered all three predictions before the run, and all three held.

**What we had not predicted.** The biggest lever was spool sizing. Oversize
every spool by one step and the floor falls to about 2 bar. The break-even
falls to 22.6 bar, so at a 25 bar margin load-sensing then loses in 62% of
cycles. At 14 bar it still wins. How tightly a designer sizes the sections
matters more here than which flow law or which source the drop comes from.

**Limits.** These are synthetic cycles from an assumed force model (pressures
and flows not measured), one load factor and no cycle-time penalty. The floor
favours open-centre, because real sections at partial travel drop more. We
also wrote the same bound for the measured 6 t wheel-loader trace used earlier
today, with five predictions registered, but this session's network could not
reach Zenodo to fetch the data. That run is next.

Code and results: [`experiments/spool_floor_synthetic.py`](../../research/heavy-hydraulics/experiments/spool_floor_synthetic.py)
and [`LOG.md`](../../research/heavy-hydraulics/LOG.md), milestone 5p.
