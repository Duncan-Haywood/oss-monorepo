---
title: "A gear-pump datasheet whose power lines carry no idle drag"
seo_title: "Gear pump datasheet power curves with no idle drag"
date: 2026-11-19
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, data-quality]
description: "Argo-Hytos GP3 draws input power at 20, 50 and 100 bar, but every line is V n p over one efficiency through the origin, so it shows zero idle drag."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme prices a small excavator's fixed gear pump against a load-sensing
pump. One question has been open since milestone 7q: Danfoss's Group 3 gear
pumps draw more power at idle as they get bigger, and the curve bends upward.
Is that how gear pumps behave, or is it just how Danfoss draws its curves? The
measure is b, the idle power of a 79 L/min pump divided by that of a 64 L/min
pump, both at the excavator's idle condition. Danfoss reads 1.781. Seven other
families from three makers read 1.27 to 1.37.

Answering it needs a catalogue that draws power at low pressure, because a
straight line carried down from rated pressure cannot see the bend (milestone
7y). Milestone 7za screened four more makers. Vivoil draws no power curves.
Turolla's Group 3 is the Danfoss pump under its earlier name. Bucher's AP300
draws power at one speed only. Argo-Hytos's GP3 datasheet (11/2015) draws input
power for twelve sizes at 20, 50, 100 bar and higher, as vector art, with the
caption "measured at 32 mm²/s".

**What the lines say.** Read off the vector paths
([`digitise_argo_gp3.py`](../../research/heavy-hydraulics/experiments/digitise_argo_gp3.py)),
every one of the 82 lines is straight in speed. Each one's slope is the
displacement times pressure over a single efficiency: the median ratio to the
datasheet's own formula with η = 0.85 is 1.047 at 20 and 50 bar and 1.047 at
100 bar and above. The lines run through the origin (median intercept −0.20
kW). So at 2100 r/min the power at zero pressure, the pump's idle drag, comes
out between −0.27 and +0.10 kW. For the other eight families at the same sizes
it is +0.39 to +1.26 kW. A real pump spinning against no load still churns oil
and rubs its bearings. These lines show none of that, so they read like a
constant-efficiency formula, not a test-bench measurement.

**What it is still good for.** Read the way the model reads every family
([`gear_pump_argo.py`](../../research/heavy-hydraulics/experiments/gear_pump_argo.py)),
GP3 gives b = 1.263. With no drag, that is the floor: the part of b that comes
from the valve's neutral pressure rising with flow. The seven flat families sit
0.01 to 0.11 above it. Danfoss sits 0.52 above it. So most of the flat families'
b comes from the valve, and Danfoss is still the only family whose own drag
rises steeply between the two sizes.

Of the four predictions written before any number was computed, three held.
The one that failed is the one that mattered: we expected a positive idle drag
for GP3 43, 51 and 61, and it was about zero. The screen for a second bending
family now has two tests: low-pressure curves (7y), and an intercept that is
not zero (7za). Passing both still needs either a bench measurement of a Danfoss
Group 3 pump at 20 to 50 bar or a catalogue nobody here has opened yet.
Details and limits are in the
[log](../../research/heavy-hydraulics/LOG.md), "Milestone 7za".
