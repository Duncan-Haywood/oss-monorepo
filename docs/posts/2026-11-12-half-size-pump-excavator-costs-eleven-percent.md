---
title: "A half-size fixed pump costs a measured excavator 11% more time, not 39%"
seo_title: "Open-centre vs load-sensing excavator: smaller pump, cycle time cost"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "On measured excavator motion, a half-size fixed pump matches load-sensing pump energy for 11% more cycle time; on a measured loader it cost 39%."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks which hydraulic circuit a small shop could build to get a
compact excavator closest to stock fuel use. A plain fixed pump with an
open-centre valve wastes oil: it pumps its full flow whenever the machine
moves, and the work uses only part of it. Earlier today we put a number on that
for a real excavator. On ten truck-loading recordings of a 7.5 t class XCMG
machine (the public
[`fuxi-robot/excavator-motion`](https://huggingface.co/datasets/fuxi-robot/excavator-motion)
dataset, CC BY-NC-SA 4.0), a fixed pump sized for peak demand delivers about
2.4 times the oil the cylinders use.

The obvious fix is a smaller pump. Then the cylinders slow down whenever the
operator asks for more than the pump gives, so you pay in cycle time instead.
On a measured wheel loader, matching load-sensing's pump energy that way cost
39% more time. This run asked what the same trade costs on the excavator.

## What we did

We wrote down six predictions before reading any data, then ran the script as
registered. Demand comes from the machine's joint speeds and the published
cylinder sizes of the XCMG XE80E (method in the earlier post). Where demand is
above the pump's flow, that moment stretches until the pump has delivered the
oil, so the work is the same and only time is added. Load-sensing is charged
its own 219 L/min pump limit. The "equal-energy" pump is the size at which
open-centre's waste equals what a load-sensing pump loses to its 20 bar margin.

## What came out

| Fixed pump | Break-even margin | Time vs load-sensing |
|---|---|---|
| 219 L/min (stock) | 118.8 bar | 1.000 |
| 175.2 L/min | 77.7 bar | 1.016 |
| 131.4 L/min | 38.4 bar | 1.056 |
| 109.5 L/min (half) | 21.1 bar | 1.108 |
| 87.6 L/min | 7.8 bar | 1.232 |

- **The equal-energy pump is 108 L/min**, 45% of peak demand and about half
  the stock pump, and the machine then takes **1.114 times** load-sensing's
  time. Across margins of 14 to 25 bar and pressures of 100 to 174 bar the
  range is 1.07 to 1.19.
- Across 384 lever, bucket-sign and swing assumptions it is 1.05 to 1.69
  (median 1.20). The loader's 1.39 is inside that range, but well above the
  central case.
- Each step down buys less. The first 10% off the pump buys 33.8 bar of
  break-even per percent of extra time; the step from 131 to 110 L/min buys
  3.3.

Three of the six predictions failed: we expected the excavator to lose more
than 25% in time, more than the loader, and more than 10% under every
assumption. It lost less. The reason is the shape of its demand: a median of
90 L/min against peaks of 240. A half-size pump covers most of the record, and
only the peaks slow down.

## What it does not show

Fuel. On the loader, the record's own fuel signal showed that the extra time
burns more than the pump energy saves, so no fixed pump won. These excavator
files have no fuel or engine signal, so the same price can't be read here. The
pressure we used comes from a different, larger excavator in the same dataset.
The 10 Hz samples miss short peaks, and those would make a small pump slower.
The break-even rule is a straight-line fit from the loader, and here it is used
further from where it was checked.

So the honest summary is narrower than a headline. On pump energy, a small
shop's open-centre excavator can get close to load-sensing for a modest time
cost. On fuel, it's still open.

Script:
[`measured_excavator_pump_size.py`](../../research/heavy-hydraulics/experiments/measured_excavator_pump_size.py),
output:
[`measured_excavator_pump_size_results.txt`](../../research/heavy-hydraulics/experiments/measured_excavator_pump_size_results.txt),
paper section 3.7c of the [draft](../../research/heavy-hydraulics/paper/draft.md).
