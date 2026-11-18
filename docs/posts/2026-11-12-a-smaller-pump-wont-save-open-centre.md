---
title: "Can a smaller pump save open-centre hydraulics? On a measured loader, only by losing 39% of cycle time"
seo_title: "Open-centre vs load-sensing: smaller fixed pump costs cycle time"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, wheel-loader, pump-sizing]
description: "On a measured 6 t wheel loader, a fixed open-centre pump matches load-sensing's 24.9 bar margin only at 28.5 cc, and the machine is then 39% slower."
---

The usual argument for open-centre hydraulics on a small machine is cost. A
fixed gear pump and a plain valve are cheap, and load-sensing is not. The
usual argument against is energy: the fixed pump delivers its full flow all
the time, and whatever the work does not use is pushed over a relief or
through the valve at the working pressure.

There is an obvious counter. Fit a smaller pump. Less surplus flow means less
waste. What you give up is speed, because at peak demand the smaller pump
cannot keep up and the boom moves slower.

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) programme
has been comparing the two circuits on a measured 6 t wheel loader loading
gravel (Linjama et al., Zenodo
[10.5281/zenodo.10639199](https://doi.org/10.5281/zenodo.10639199), CC BY 4.0).
With the loader's own 63 cc pump, open-centre breaks even with load-sensing
only at an 87 bar load-sensing margin, and the machine runs at 24.9 bar. So
today's question: how small does the open-centre pump have to get to close
that gap, and what does it cost in time?

## The answer

We swept the fixed pump from 63 down to 25 cc at the engine speed the loader
actually ran. Where the demand is more than the pump delivers, the cylinders
slow until the pump delivers the volume asked for. A slowed moment costs the
same hydraulic energy, it just takes longer. Load-sensing is held to its own
63 cc pump limit, so the time cost isolates the smaller pump.

| Fixed pump | Break-even LS margin | Open-centre cycle time vs load-sensing |
|---|---|---|
| 63 cc | 87.0 bar | 1.00 |
| 50 cc | 58.9 bar | 1.07 |
| 40 cc | 41.6 bar | 1.17 |
| 32 cc | 29.6 bar | 1.30 |
| **28.5 cc** | **24.9 bar** | **1.39** |
| 25 cc | 20.5 bar | 1.50 |

Matching load-sensing at the margin the machine actually runs takes a pump of
about 28.5 cc, 45% of the original, and the loader is then 39% slower over the
record (27 to 54% across its 18 Y-cycles). Any pump of 40 cc or more still
loses on energy, and is already 17% slower.

The trade gets worse the further you go. The first 7 cc off the pump buy 5.6
bar of break-even for each percent of extra time; the last steps buy under
half a bar. The surplus flow that survives a small pump comes when demand is
low, and on this machine low demand comes at lower pressure (the pressure the
surplus is pushed at falls from 99.5 to 80 bar), so each cc saves less than
the one before.

We wrote down five predictions before writing the code (pump size at parity
between 25 and 40 cc, time cost above 25% there, and three more). All five held.

## Something we found in the data

The loader's derived cylinder flows add up to more than its 63 cc pump could
geometrically deliver in 16% of moving samples, by a median 3 L/min. The
authors' own pump-angle estimate in those samples is above full stroke
(median 1.055), so the excess sits in the flows derived from piston velocity,
not in the pump. Holding load-sensing to the same pump limit cancels it out,
but anyone reusing this dataset for pump sizing should know.

## What it means for a builder

On a loader-like duty an open-centre circuit pays either in energy or in
productivity. With a pump big enough to keep the machine's pace, it breaks
even only at a load-sensing margin far above any sold. With a pump small
enough to match on energy, the machine is about a third slower. There is no
size that avoids both.

## Limits

Hydraulic energy only. The engine keeps burning fuel through the extra time,
and that is not charged here, so the 39% understates open-centre's full cost.
The slowing rule is the simplest one: no operator change and no engine
speed-up, which a real machine could trade for fuel. One machine, one 440 s
record. The next step prices the extra time with the engine's measured fuel
rate from the same record.

Code, results and the registered predictions:
[`experiments/measured_pump_size.py`](../../research/heavy-hydraulics/experiments/measured_pump_size.py),
[results](../../research/heavy-hydraulics/experiments/measured_pump_size_results.txt),
[`LOG.md`](../../research/heavy-hydraulics/LOG.md).
