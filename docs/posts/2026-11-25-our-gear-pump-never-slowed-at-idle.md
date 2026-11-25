---
title: "Our excavator model's gear pump never slowed down at idle"
seo_title: "Gear pump idle power at half engine speed: a modelling bug we found"
date: 2026-11-25
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, reproducibility]
description: "A test of a better pick-table key failed, and while checking why, we found that our half-idle-speed results ran each gear pump at full speed."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator should carry a load-sensing pump or
a cheaper fixed gear pump on an open-centre valve. Part of the answer is a
selection rule: given a gear pump's catalogue curves, how good does it have to
be before it beats the load-sensing pump on fuel? Earlier steps built a "pick
table" for that rule, keyed on how steeply a pump's idle drag rises between
64 and 79 L/min (its *bend*).

Today's step (milestone 7zc) tested a change the previous step had
recommended: key the table on the bend *relative to the valve*, r = b / b0,
where b0 is the bend a pump with no drag at all would show on that valve.
That number turned out to be the right way to say *which* pump families bend.
We wrote four predictions down before running anything.

## The key change made the table worse

Scored the same way as before (each idle condition and each pump maker left
out of the fit, 308 held-out cases):

| Table key | Left-out RMS error |
|---|---|
| bend at the central setting (the existing table) | 0.0052 |
| relative bend r, mapped to a central-equivalent row | **0.0057** |
| the same, with rows built at r exactly | 0.0060 |
| raw bend at the machine's own valve curve | 0.0050 |

One prediction of four held. The reason is simple once you see it. The
table's rows are built from pumps bent at the central setting, so a row
needs to know how steep a pump's idle curve really is in kilowatts.
Dividing by b0 sends twelve of fourteen pump variants to the flattest row on
the steeper valve readings, and that row charges too little drag. The
recommendation from 7zb was wrong, and the paper's supplement now says so.

## The bigger find: half idle speed was never half speed for the gear pump

The previous step's half-speed bends did not match the factorial's
half-speed bends for the same pump (Casappa KP30: 1.566 against 1.364), so we
checked why. The factorial that every rule since milestone 7h was scored on
builds each gear pump once, at working speed (2100 r/min). At "half idle
speed" it slows the valve's neutral pressure and the load-sensing pump's
standby flow, but it reads the gear pump's absorbed power off its
**2100 r/min curves**.

Read off its own 1050 r/min curves instead, a gear pump absorbs **0.31 to
0.66** of that idle power at 85 L/min on the PVG 32 valve reading, and 0.16
to 0.79 on the other two (leaving out Argo-Hytos GP3, whose datasheet lines
carry no drag and go slightly negative at low speed). Danfoss is the least reduced, because most of its
drag at that speed does not fall with speed. So the half-speed results in the
paper (that idling at half speed *raises* the efficiency a gear pump needs by
0.02 to 0.03, and that a rule frozen at working speed misses there by up to
0.035) describe a machine whose gear pump keeps spinning at full speed while
the engine idles. Corrected, the gear pump's idle penalty shrinks much more
than the competitor's, so we expect the half-speed crossing to fall, not
rise. That is a prediction for the next step, not a result.

The working-speed conditions, the central setting and every excavator
break-even at working speed are unaffected. The manuscript now says this
in its limitations, citing the diagnostic's output
(`experiments/gear_pump_halfspeed_results.txt`). The next milestone
rebuilds the 22-condition factorial with each pump at its own idle speed.

## Reproduce

```
cd research/heavy-hydraulics/experiments
python gear_pump_halfspeed.py      # seconds, no downloads
python gear_pump_bendtable.py      # ~15 min first time: rebuilds caches from Hugging Face
python gear_pump_rkey.py           # ~2.5 min on the cache
```

Everything is in [`LOG.md`](../../research/heavy-hydraulics/LOG.md),
"Milestone 7zc".
