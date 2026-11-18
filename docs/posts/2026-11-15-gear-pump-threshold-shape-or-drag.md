---
title: "Gear pump efficiency at 150 bar: is one number enough to choose an excavator circuit?"
seo_title: "Gear pump vs load-sensing: does curve shape or idle drag matter?"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator]
description: "Sixteen shape-and-drag combinations of four measured gear-pump families all cross at 0.807 to 0.830. Idle drag is the second number, about 0.016 per kW."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme's paper reduces a small excavator's circuit choice to one
number. A smaller fixed gear pump on an open-centre valve beats
load-sensing on fuel in half of 384 cylinder-geometry readings once the
gear pump's overall efficiency at 150 bar, 2100 r/min and the 85 L/min
size passes about **0.82**. An earlier run today showed that the
crossing does not depend on the curve fitted through the points.

A harder question was left in the paper's limitations: each maker's
sweep scaled that maker's whole efficiency map up and down, so the
curve says how the answer moves with efficiency *level*. Real pumps
also differ in *shape* (how efficiency changes with pressure and with
size) and in how much they drag at idle. Do three makers land on one
curve because the one number is enough, or because their shapes
happened to cancel?

## The test

Four measured families: the Casappa, Danfoss and Marzocchi catalogue
curves and a bench-tested Casappa KP30 (Frosina et al. 2017). Each has a
shape (its efficiency map divided by its own efficiency at the index
point) and an idle drag. Crossing every shape with every drag gives 16
pumps. Each was swept in efficiency and rerun through the break-even
on the measured excavator motion, and its 50% crossing read off. The
diagonal cells are the committed per-maker sweeps, and they reproduce
them to within 0.0012. Five predictions were written into the
[log](../../research/heavy-hydraulics/LOG.md) before the sweep ran.

| shape \ idle drag | Casappa | Danfoss | Marzocchi | bench |
|---|---|---|---|---|
| Casappa | 0.8277 | 0.8283 | 0.8300 | 0.8172 |
| Danfoss | 0.8217 | 0.8297 | 0.8217 | 0.8100 |
| Marzocchi | 0.8175 | 0.8214 | 0.8193 | 0.8069 |
| bench | 0.8216 | 0.8214 | 0.8231 | 0.8116 |

## What it says

All 16 crossings fall between **0.807 and 0.830**, at most 0.014 from
the paper's 0.8212, about the same width as the maker-bootstrap
interval. The one number is close to enough.

What moves the crossing most is not shape but **idle drag**. The
bench pump drags 2.85 kW at 85 L/min against the catalogue families'
3.32 to 3.64 kW, and its column sits 0.011 to 0.014 lower. Across the four
drags the crossing moves about 0.016 per kW. Shape moves it less (row
means span 0.0095, columns 0.0138). The one prediction that failed was
that the four shapes would span at most 0.010 with one drag held. They
spanned 0.0102.

Of shape, what matters is how efficiency changes with pump size, since
the fuel optimum often picks a size away from 85 L/min. A synthetic
slope of ±10% per 85 L/min moves the crossing by up to 0.0086. Changing
efficiency with pressure hardly matters (±0.05 per 100 bar, at most
0.0013), because at the sizes chosen the pump works near 136 bar, close
to the 150 bar index point.

For someone building a machine, the rule gains a second, smaller
number. Measure the candidate gear pump's overall efficiency at 150 bar,
and also its no-load drag at working speed.

## Limits

Four shapes are four families, not a population of pumps. The synthetic
tilts and slopes are linear. The load-sensing pump and the motion
record are unchanged from earlier milestones. The open question is
still whether typical gear pumps run near their catalogue curves or
near the one bench unit. A multi-unit test dataset would answer it,
read now for both efficiency and drag.

Code: [`experiments/gear_pump_shape.py`](../../research/heavy-hydraulics/experiments/gear_pump_shape.py)
(about 20 s on the cached motion record) and its
[results](../../research/heavy-hydraulics/experiments/gear_pump_shape_results.txt).
