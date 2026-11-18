---
title: "Two gear-pump catalogues, two answers to the same excavator question"
seo_title: "Gear pump efficiency at 150 bar: two catalogues, two excavator answers"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, open-centre, excavator, digitising]
description: "Danfoss and Casappa gear-pump curves, read from the PDFs, differ by 0.07 in efficiency at 150 bar, and an excavator fuel ranking flips between them."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator should carry a load-sensing piston
pump or a cheaper fixed gear pump on an open-centre valve. Earlier today,
milestone 6k priced the fixed pump from Casappa's KAPPA 30 catalogue curves
and the answer swung hard toward load-sensing. A smaller fixed pump beat it
on fuel in only 9.9% of 384 cylinder-geometry readings of measured excavator
motion, down from 74% when the fixed pump was treated as a piston pump.

One catalogue is a thin basis for that, so milestone 6m repeated it with a
second manufacturer.

## Reading the curves, not eyeballing them

Danfoss's *GearMe Aluminum Group 3* technical information (February 2023)
has a chart for each of ten pump sizes, 22 to 88 cm³/rev. Each chart shows
output flow at 7 bar and at a high pressure, and input power at 100 bar,
150 bar and the rated pressure. All of it was measured in ISO VG46 oil at
50 °C. The charts are vector drawings, so
[`digitise_danfoss_snp3.py`](../../research/heavy-hydraulics/experiments/digitise_danfoss_snp3.py)
reads the line coordinates straight out of the PDF. The axis numbers are
outlined glyphs rather than text, so each axis is calibrated by fitting a
line through the positions of its labels. The worst label sits 0.21 L/min
off that line.

## What the two catalogues say

At 2100 r/min and 150 bar:

| | Casappa KAPPA 30 (6k) | Danfoss SNP3 (6m) |
|---|---|---|
| overall efficiency, range over sizes | 0.71 to 0.80 | 0.75 to 0.86 |
| median difference where both cover the same flows | | +0.068 |
| geometries where a smaller fixed pump beats load-sensing (3.99 L/h, idle 38% of hours) | 9.9% | **70.1%** |

The piston pump that 6i and 6j used reads 0.84 at the same point, which is
level with Danfoss. With Danfoss's curves the excavator result goes back to
what the piston pump gave: a smaller fixed pump wins in about seven
geometries out of ten. Across 18 settings of idle speed, standby flow and
valve neutral curve the share runs from 68.8% to 90.4%.

## Where the answer flips

The useful number is where the ranking changes sides. Scaling Danfoss's
efficiencies down, the share drops to 50% at 0.98 times the curves. 6k found
the same crossing at 1.09 times Casappa's. Both point to the same place: a
fixed gear pump of roughly **0.82 overall efficiency at about 150 bar**. The
two manufacturers sit about 0.07 apart, on opposite sides of that line, and
each is only a few hundredths away from it.

So the question is no longer whether an excavator carries a gear pump or a
piston pump. What matters is how efficient its particular gear pump is, and
that is something a hydraulic test bench can measure (ISO 4409).

## What we're not claiming

- Both sources are manufacturers' "typical" curves, not test reports.
- The Danfoss sheet is less self-consistent than Casappa's. Its 88 cm³/rev
  chart draws about twice the input power its own flow would need (an
  efficiency of 0.50), so it was dropped. That size only covers pumps above
  153 L/min, which never come out as the best choice, and dropping it changes
  no figure.
- In several Danfoss charts the pump reads more efficient at its rated
  pressure than at 150 bar.
- Drag at zero pressure has to be continued from the 100 and 150 bar lines,
  and it scatters from 3.8 to 31 bar-equivalents across sizes. That is why the
  result is also run with Casappa's idle drag: 72.7%.
- Four of the six predictions registered before any curve was read were
  wrong. They are in the
  [log](../../research/heavy-hydraulics/LOG.md) next to the outcomes.

Everything reruns in about 11 seconds from
[`excavator_gear_pump_danfoss.py`](../../research/heavy-hydraulics/experiments/excavator_gear_pump_danfoss.py).
Its output, including the Casappa and piston checks that reproduce 6k and 6j
exactly, is
[committed](../../research/heavy-hydraulics/experiments/excavator_gear_pump_danfoss_results.txt).
