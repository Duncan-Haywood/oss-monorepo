---
title: "A sixth gear-pump family failed our registered test, and the failure was in how we read its catalogue"
seo_title: "Gear pump efficiency rule: a held-out family fails, then explains why"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, excavator, pre-registration, negative-result]
description: "Rexroth's AZPN missed our gear-pump rule by 0.029 because we extrapolated its efficiency past its largest size. Read on that size, it misses by 0.0001."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks when a smaller fixed gear pump on an open-centre valve
burns less fuel than load-sensing on a small excavator. The answer we have
built up today comes down to two numbers from the pump's data sheet: its
overall efficiency at 150 bar, read at the size the fuel optimum picks
(85 L/min), and its power draw at zero pressure. With
[each of five families held out in turn](2026-11-15-gear-pump-rule-holds-every-family-out.md),
the rule E<sub>50</sub> = 0.824 + 0.018 (kW &minus; 3.57) placed every
family's 50% point within 0.0042.

Five folds is not much. So this run digitised a sixth family that no fit
had seen, Bosch Rexroth's AZPN (data sheet RE 10091, sizes 20 to
36 cm<sup>3</sup>/r). We read it from the PDF's vector paths, as we did
the AZPG, and wrote six predictions into the log before reading a single
curve.

## The registered test failed

| | Value |
|---|---|
| AZPN no-load drag at 85 L/min | 2.49 kW (lowest of six families) |
| Efficiency index at 85 L/min, as registered | 0.9587 |
| AZPN 50% crossing, as registered | 0.8342 |
| Two-number rule's prediction | 0.8049 |
| Error | **+0.0293** |
| One-number rule's error | +0.0170 |

The two-number rule missed by three times its worst earlier error and did
worse than a constant. Four of the six predictions were refuted. Over six
families left out in turn, the drag rule no longer beat one number (RMS
0.0131 against 0.0127).

## Why it failed

The AZPN's largest size gives 75.6 L/min at 2100 r/min, short of the
85 L/min where the index is read. The index code fills that gap by drawing
a straight line through the efficiencies of the last two sizes and
extending it: 0.895 at 67 L/min and 0.925 at 76 L/min extend to 0.959 at
85 L/min, higher than any size Rexroth draws. The simulation never uses
that number. Beyond its largest size, the pump model keeps that size's
efficiency, 0.925.

The crossing is measured in units of the index, so an index that is too
high by some factor gives a crossing too high by the same factor. Here
the two indices differ by a ratio of 0.9648 and the two crossings by
0.9650. The five earlier families all reach 85 L/min, so for them the
two readings agree exactly. The AZPN is the first family whose sizes stop
short of the index point.

## Read the way the model uses the pump

With the model's own efficiency at 85 L/min (0.925) as the index:

- the AZPN crosses at **0.8050**; the rule as committed predicts 0.8049
  (error +0.0001);
- refitted on all six families, the rule is
  E<sub>50</sub> = 0.8245 + 0.0183 (kW &minus; 3.57), almost unchanged;
- with each of six families left out in turn, the drag rule's RMS error
  is 0.0023, against 0.0120 for efficiency alone.

We chose this reading **after** the registered test failed, so it is a
diagnosis, not a confirmation. The results file and the paper label it
that way. The next step is to fix the index so that it holds the largest
size instead of extrapolating, register that fix, and test a seventh
family under it. The fix leaves the five earlier families unchanged.

## What a builder takes from it

Read the efficiency on a pump size the maker actually sells, at the flow
your machine needs. A catalogue's trend across sizes is not a measurement
at a size that does not exist. Here it would have overstated the pump by
0.034, and the answer moved by the same factor.

Everything is in the repository: the digitiser
(`experiments/digitise_rexroth_azpn.py`), the sweep
(`experiments/gear_pump_six.py`), its results file, and the log entry
with the predictions as written before the run ("Milestone 6y" in
[`LOG.md`](../../research/heavy-hydraulics/LOG.md)).
