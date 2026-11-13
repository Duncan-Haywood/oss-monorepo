---
title: "A load-sensing pump at part stroke gives back the fuel it saves"
seo_title: "Piston pump efficiency at part stroke: load-sensing vs a fixed pump"
date: 2026-11-13
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, pump-efficiency, fuel]
description: "A measured piston pump gives 0.84 at full stroke, 0.74 at 0.4 of it. On a 7.5 t excavator a smaller fixed pump then wins on fuel in up to a third of cases."
---

This morning the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme looked settled. A smaller fixed pump on an open-centre valve can match
a load-sensing pump's energy on a 7.5 t class excavator if you give it extra
cycle time, but the engine burns fuel during that time. Tractor tests put the
burn at 4.0 to 5.1 L/h for this engine
([earlier post](2026-11-13-tractor-tests-price-an-idle-excavator.md)), and with
that number load-sensing kept the fuel lead in all 384 readings of the
machine's cylinder geometry.

That result charged both pumps the same efficiency, 0.818, borrowed from a
measured wheel loader. Hydraulic engineers know that is too kind to
load-sensing. A fixed pump always runs at full stroke. A load-sensing pump
follows demand, and on this excavator the median demand is about 90 L/min out
of a 219 L/min pump, about 0.4 of stroke. Piston pumps lose efficiency at part
stroke, so the open question was how much.

**One pump, measured at four locked strokes.** Kauranne (Aalto University)
tested a 45 cm³/r swash-plate pump to ISO 4409 with the swash plate locked at
45, 33, 23 and 12 cm³/r. That makes each curve a fixed-displacement pump at
that stroke
([Energies 15:4030, 2022](https://doi.org/10.3390/en15114030), CC BY). The
paper released no data, so we digitised its Figure 13 by line colour. Where one
curve hides behind another, the hidden one takes the visible curve's position.
The read error is 0.5 to 1 efficiency point. At 60 °C and 150 bar the pump
runs at 0.84 at full stroke, 0.82 at 0.6 of stroke, 0.74 at 0.4 and 0.67 at
0.27.

**On the excavator's measured motion, load-sensing averages 0.769.** We
weighted by flow over every moving sample. Across the 384 geometries it runs
from 0.68 to 0.79. On a 130 bar working load, that 7-point gap against a
full-stroke fixed pump costs more than the 20 bar load-sensing margin itself.
Three numbers move:

- the central geometry's break-even engine burn rises from 2.33 to **5.50 L/h**
- the median across geometries rises from 0.95 to **3.32 L/h**
- a smaller fixed pump now beats the tractor-test no-load rates in **17 to 33%**
  of geometries, up from none (22 to 39% with cold oil)

At the stock pump size, open-centre still loses everywhere.

**But the reversal is narrow.** We asked how much less efficient the fixed pump
could be before load-sensing wins back. At the central geometry the answer is
0.808 instead of 0.840, about 4% worse. Across the geometries where the fixed
pump wins, the median is 3% worse. A gear pump, or a smaller and less refined
piston unit, would very likely hand the ranking back.

So for this machine, which circuit burns less fuel no longer depends mainly on
the engine. It depends on two pump numbers: how efficient the variable pump is
at 0.4 of stroke, and how efficient the fixed pump is at full stroke. A builder
choosing between them should ask the pump makers for those two figures before
anything else.

**What this does not show.** The curve comes from one pump of unnamed make. We
scaled it to the XE80E's 104.3 cm³/r pump by stroke fraction, and we did not
adjust it from 1500 to 2100 r/min. Below 0.27 of stroke we held it flat, which
flatters load-sensing. Load-sensing's standby flow and compensator losses are
not charged. All six predictions were written down before the curve was
digitised, and all six held. We had seen the figure first, though, so the
predictions only rule out reading the result backwards. They are not a blind
test. Script, digitised table and results:
[`excavator_part_stroke_eta.py`](../../research/heavy-hydraulics/experiments/excavator_part_stroke_eta.py),
[`kauranne2022_fig13_total_efficiency.csv`](../../research/heavy-hydraulics/experiments/data/kauranne2022_fig13_total_efficiency.csv),
[results](../../research/heavy-hydraulics/experiments/excavator_part_stroke_eta_results.txt).
