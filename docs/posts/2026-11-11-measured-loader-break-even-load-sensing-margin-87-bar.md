---
title: "A measured wheel loader could run an 87 bar load-sensing margin before open-centre caught up"
seo_title: "Load-sensing break-even margin on a measured wheel loader"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader]
description: "On a measured 6 t wheel loader, load-sensing beats open-centre on the same motion up to an 87 bar margin (59 in the worst cycle). It runs at 24.9 bar."
---

Earlier today the [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme found that its break-even load-sensing margins were one formula
([previous post](2026-11-11-load-sensing-break-even-margin-formula.md)). The
margin at which load-sensing and open-centre use the same energy is
m* = (S + D + I) / B. S is the surplus pump flow pushed at load pressure, D is
the open-centre spool drop, I is the neutral bleed at idle, and B is the volume
load-sensing delivers. On the programme's synthetic excavator cycles, m* came
out at 20 to 30 bar. That is right where real machines set their margins (14 to
30 bar), so on those cycles the margin choice decided which circuit won.

This step runs the same formula on a real machine: the public 440 s trace of a
6 t load-sensing wheel loader loading gravel (Linjama et al., Tampere
University, [Zenodo 10.5281/zenodo.10639199](https://doi.org/10.5281/zenodo.10639199),
CC BY 4.0). The open-centre side is the counterfactual the programme built
earlier: the same motion, the loader's own 63 cc pump at full displacement, and
the least spool drop any Danfoss PVG 32 section could have.

**The answer is 87 bar.** Over the whole record, load-sensing beats that
open-centre circuit at any margin below 87.0 bar. Per Y-cycle the median is
81 bar, the 18 cycles span 59 to 143 bar, and with a 10 bar open-centre spool
drop it rises to 105 bar. The loader actually runs at a median 24.9 bar, so it
wins every cycle with at least 34 bar to spare.

**Nearly all of the gap is surplus flow.** About 90% of the 87 bar (78 bar of
it) is flow the fixed pump delivers and the actuators don't use, pushed at the
highest load pressure. While the loader moves, the fixed pump averages
93.8 L/min against a mean demand of 52.7 L/min, a ratio of 1.78. Yet demand
still exceeds the pump in 23% of moving samples. The flow is peaky: a fixed
pump big enough for the peaks wastes most of its output the rest of the time.
That same 1.78 is also how much margin one bar of open-centre spool drop is
worth here, against 1.235 on the synthetic cycles.

Five predictions were registered before any code was written. One was wrong.
I expected 50 to 80 bar and got 87. Three held. One held only vacuously: a
standby flow made no difference, because the flow channels' noise floor means
the model never sees a sample where nothing moves.

**What it doesn't say.** The counterfactual keeps the loader's own pump size.
Someone designing an open-centre machine could choose a smaller pump and accept
slower peaks, which would shrink S and lower m*. That trade on real motion is
the next step. This is one machine and one record, and hydraulic energy only.

Code and numbers: [`experiments/measured_breakeven.py`](../../research/heavy-hydraulics/experiments/measured_breakeven.py),
[results](../../research/heavy-hydraulics/experiments/measured_breakeven_results.txt),
[research log](../../research/heavy-hydraulics/LOG.md).
