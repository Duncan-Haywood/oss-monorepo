---
title: "One gear-pump family in eight bends: Casappa's Polaris 30 read from its catalogue's vector curves"
seo_title: "Gear pump idle drag: Polaris 30 joins the flat families"
date: 2026-11-19
tags: [hydraulics, gear-pump, excavator, digital-twin, research]
description: "Read from its vector curves, Casappa's Polaris 30 gear pump draws 2.65 kW idling at 64 L/min and does not bend. Danfoss is now alone among eight families."
---

The [heavy-hydraulics programme](../../research/heavy-hydraulics/README.md)
asks which buildable hydraulic circuit gets a small excavator closest to stock
energy use. One of its quieter questions decides how a builder should size
the fixed gear pump on an open-centre machine. When the machine idles with the
valves in neutral, how fast does the pump's absorbed power grow as the pump
gets bigger?

The project measures that with one number, the bend
b = P<sub>idle</sub>(79 L/min) / P<sub>idle</sub>(64 L/min), read at the
model's central idle condition. Seven catalogue families were already in the
panel. Six of them sat between 1.28 and 1.37. Danfoss's GearMe Group 3
(SNP3) sat at 1.781. Since then, several milestones have tuned selection rules
for a pump that bends like Danfoss, on the assumption that it represents a
class of real pumps. A second family that bends would back that assumption,
and finding one was the open step.

## Why the last candidate failed

The previous step (7y) found one new catalogue in range, but it drew input
power only within 50 bar of each size's rated pressure. Cutting the seven
known families down to the same band showed what that costs: the extrapolated
idle drag moved by a median 29.5%, and three of seven families changed class.
Danfoss itself read flat. So the next family had to come from a catalogue
that draws power curves at 50 or 100 bar.

## The Polaris 30

Marzocchi's catalogues were checked first. GHP draws curves only for its
smallest group, and the cast-iron FCIP and Elika catalogues draw none.
Casappa's download server had what was needed. Its 2024 Polaris catalogue
(PL 06 T A) draws absorbed power for the PLP 30, from 22 to 91 cm³/r, at 50,
100, 150 and up to 250 bar. The charts are vector art in the same layout as
the Kappa catalogue the project already reads. At the model's working speed
of 2100 r/min, 64 and 79 L/min fall between the 30.27 and 30.38 sizes, so the
pump is read inside its own range. The model never has to hold a size or
spin one faster.

The new reader,
[`digitise_casappa_polaris30.py`](../../research/heavy-hydraulics/experiments/digitise_casappa_polaris30.py),
finds each chart's frame, checks its grid lines and reads the curves straight
from the PDF paths. Two checks back it up:

- The 20-bar flow lines' slopes match the displacements printed in the
  catalogue's table to within 0.1%.
- The catalogue's own dashed torque curves imply an input power about 5% below
  its solid power curves. The project's Kappa read agreed to 0.5%, so this
  catalogue is less self-consistent. The gap is reported, not hidden.

The predictions were written and pushed before any number was computed.

## The result

| family | P<sub>idle</sub>(64), kW | P<sub>idle</sub>(79), kW | b |
|---|---|---|---|
| Casappa Polaris 30 (new) | 2.650 | 3.372 | **1.272** |
| Casappa Kappa 30 | 2.373 | 3.258 | 1.373 |
| Marzocchi ALP3 | 2.485 | 3.218 | 1.295 |
| Rexroth AZPG, AZPU, AZPN, AZPF | 1.69 to 1.84 | 2.27 to 2.38 | 1.28 to 1.34 |
| Danfoss SNP3 | 2.418 | 4.308 | 1.781 |

The Polaris 30 is flat, with the lowest bend in the panel. Three of the four
predictions held. The one that failed missed narrowly: Polaris and Kappa
differ by 0.101 against a predicted bound of 0.10.

## What it changes

Until now, the project treated Danfoss's bend as a property of real pumps
that the panel under-sampled: a data gap, not a modelling one. Now one family
in eight bends, and it is the only one. Catalogues cannot say whether that is
the pump or the way its curves are drawn. A bench test of a Group 3 SNP3 at
20 to 50 bar would settle it. Until then, the paper should describe the
bend-specific selection rules as fitted to one family, not to a class of
pumps.

The limits are real. The Polaris is from the same maker as the Kappa, so it
is not an independent manufacturer. Its oil is ISO VG 46 rather than 36 cSt,
its charts are dated 2003, and only the central idle condition was rerun.
The data, the script and the results file are in
[`research/heavy-hydraulics`](../../research/heavy-hydraulics/LOG.md), under
"Milestone 7z".
