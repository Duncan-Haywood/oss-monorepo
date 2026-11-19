---
title: "Measured gear pumps put the bend's anchor near 64 L/min, not 79"
seo_title: "Gear pump idle drag: where a bending curve holds its level"
date: 2026-11-19
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, sensitivity-analysis]
description: "Read off 13 measured gear-pump idle drag curves, a steeper one holds its level near 61 to 65 L/min, so the synthetic bend table still beats the two-price rule."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a small excavator should carry a cheap fixed gear pump
instead of a load-sensing pump. Its selection rule predicts the gear-pump
efficiency at which the two tie on fuel. The builder's best form so far is
the "two-price" rule, with an error of 0.0056 (left-out RMS over 308 cases).

Two milestones ago (7r) a pick table did better, at 0.0052. Each row lists
the pump sizes the fuel optimum picks for a given *bend* of the idle drag
curve (drag at 79 L/min over drag at 64 L/min). The rows were built by
bending measured pumps' curves synthetically. This morning's milestone (7s)
found the gain depends on one choice. When a curve bends more, does it
keep its level at 64 L/min and get dearer at large sizes (the table wins)?
Or does it keep its level at 79 and get cheaper at small sizes (the table
loses, 0.0059)? The log called that "a property of real pumps".

## Asking the measured pumps

There are 13 measured pump variants besides Danfoss, the one pump that bends
hard (1.78). Under a power-law bend that pivots at some flow q*, the slope of
log drag at 64 L/min on log bend across pumps tells you where q* is. So the
run read q* off the other pumps for each held-out family, never touching the
pump being predicted. It used two estimates: a pooled slope over all donor
variants, and a slope within the two families that come in several variants.
The predictions went into the log before any number was computed.

| table anchor | pivot (Danfoss fold) | left-out RMS | Danfoss error |
|---|---|---|---|
| fixed at 79 L/min (7s) | 79.0 | 0.0059 | 0.0110 |
| fixed at 64 L/min (7r) | 64.0 | 0.0052 | 0.0063 |
| pooled slope | 65.4 | 0.0052 | 0.0068 |
| within-family slope | 61.1 | 0.0050 | 0.0054 |
| two-price rule | | 0.0056 | 0.0061 |

Both measured reads put the pivot near 64 L/min, not 79. With either one,
the table beats the two-price rule in all three tests: the left-out
condition, unseen half idle speed and unseen idle shares. With the
within-family anchor, the table's Danfoss error comes in below the
two-price rule's for the first time. Seven of eight predictions held.

## The prediction that failed, and why it matters

I expected Danfoss's drag at 64 L/min to sit *below* the line the other pumps
draw for its bend, because the optimum sizes it down to 58.5 L/min. It sits
29% *above*. Danfoss is not just steep, it is high everywhere. No bend of
another pump's curve copies that, so even the best row still charges it 1.17
times the drag it pays at its own picks.

The within-family read has a weakness too. Within a family, the drive
variants add drag only above the family's largest size. The AZPN family ends
at 75.6 L/min and the AZPF at 58.9, so the slope says where each catalogue
ends, not how bend relates to level. A fixed sweep of the anchor shows the
score falling the lower the pivot goes, with no minimum, so the score alone
can't pick the anchor either.

What the run settles is narrower but real: the measured pumps don't support
the pivot-79 reading that 7s had to leave open. The two-price rule stays the
builder's form, and the next step is a measured second bending family, plus a
row that prices a pump's height as well as its bend.

Code and numbers:
[`experiments/gear_pump_anchor.py`](../../research/heavy-hydraulics/experiments/gear_pump_anchor.py),
[`gear_pump_anchor_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_anchor_results.txt);
the registration and outcome are in the
[log](../../research/heavy-hydraulics/LOG.md), milestone 7t. Everything here
comes from a simulation on measured excavator motion and digitised data-sheet
curves. The bent rows are synthetic, so this is a sensitivity, not a
measurement.
