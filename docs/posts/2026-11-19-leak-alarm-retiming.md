---
title: "Re-timing a leak localiser to the alarm: 17 rules, one leak gained, and the oracle day stays out of reach"
seo_title: "Leak localisation on BattLeDIM: re-timing to the alarm"
date: 2026-11-19
tags: [research, water-leaks, BattLeDIM, leak-localisation, water-distribution]
description: "On BattLeDIM's L-Town, a lag or vote around the detector's alarm picked on 2018 places 4 of 22 detected 2019 leaks within 300 m, against 12 at the oracle day."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town. L-Town is a simulated water
network with two years of sensor data and a published leak schedule, so
nothing here is a field result.

[The last step](2026-11-17-leak-localiser-oracle-hour.md) swapped an oracle for
a real detector. Until then, the localiser ran on the day each leak's own flow
reached half its peak, which no utility can know. Run instead on the day the
project's pressure detector raised its alarm, it kept only about half its hits.
Shifting the oracle day by a single day already cost several.

## The question

Is that loss a fixed offset? If the alarm tends to come a few days early or
late, a rule that waits a set number of days, or votes over a window of days
around the alarm, should win most of it back. If the right day is different
for every leak, nothing fixed will.

## The test

Seventeen rules, written into the
[research log](../../research/water-leaks/LOG.md) before any of them was run:

- **Lag rules (nine).** Localise from 7 days before the alarm to 7 days after.
- **Vote rules (eight).** Localise on every day of a window around the alarm
  and keep the location picked most often.

The rule with the most hits on the 28 leaks the detector finds in 2018 (real
and simulated) was frozen. Only then were the 22 detected 2019 leaks scored.

## What happened

| rule | 2018, tuning (of 28) | 2019, test (of 22) |
|---|---|---|
| oracle half-peak day (reference) | 14 | 12 |
| **vote over the 4 days before the alarm and the alarm day (selected)** | **10** | **4** |
| the alarm day itself (last step) | 8 | 3 |
| best rule in 2019 alone (1 day before the alarm) | 9 | 6 |

Hits are leaks placed within 300 m along the pipes. Chance would place 0.8 of
the 22.

Three of the five predictions held. The selected rule beat the alarm day, beat
chance (P = 0.007) and kept its 2018 gain per leak. Two failed: it did not
close half the gap to the oracle day (bar: 8), and it did not beat the alarm
day significantly. That gain is one leak.

The more telling number is how badly the rules' 2018 ranking predicts their
2019 ranking: a rank correlation of 0.09. Every rule lands between 2 and 6 in
2019. On the simulated 2019 leaks, no rule places more than 2 of 12, against 6
at the oracle day.

## What it means

The oracle day's advantage is not a timing offset. It is information about each
leak that a raw-pressure alarm does not carry. The detector's alarms fall
anywhere from 43 days before to 21 days after the half-peak day, and no fixed
window around them finds it. So detect-then-localise on this residual places
4 of the 48 leaks that start in 2019.

The fix has to come from the detector. Earlier in the programme, the residual
that the localiser runs on showed every leak within hours. A detector run on
that residual should alarm at a consistent point in each leak's rise, and that
is the next step.

The usual caveat still holds: that residual removes demand with the
benchmark generator's own model, which a utility would not have.

Code, results and the per-rule table:
[`experiments/step27-retimed/`](../../research/water-leaks/experiments/step27-retimed/).
