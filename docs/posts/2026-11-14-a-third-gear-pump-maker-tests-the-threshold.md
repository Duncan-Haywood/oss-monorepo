---
title: "A third gear-pump maker tests our excavator fuel threshold"
seo_title: "Gear pump efficiency threshold, tested on a third manufacturer"
date: 2026-11-14
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, gear-pump, out-of-sample]
description: "Two makers' curves put the excavator fuel flip at a gear pump of about 0.83 efficiency. A third maker, never used to fit it, crosses at 0.819."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator should carry a load-sensing pump
or a smaller fixed gear pump on an open-centre valve, judged on fuel. This
morning's step (6n) reduced the answer to one number. A smaller fixed pump
starts to win once the gear pump reaches about **0.83 overall efficiency at
150 bar and 2100 r/min**, at the pump size the optimum picks (about 85 L/min).

That number came from two manufacturers' published curves, Casappa's and
Danfoss's. A threshold fitted on two families mostly describes those two
families. It means more only if a family it never saw lands where it says.

## The test

Marzocchi's ALP catalogue draws eleven ALP3 gear pumps (20 to 87 cm³/r).
It gives flow at 25 bar and at each size's maximum pressure, and absorbed
power at 25 to 250 bar, all at 50 °C. The charts are vector paths in the
PDF, so we read them exactly rather than by eye
([`digitise_marzocchi_alp3.py`](../../research/heavy-hydraulics/experiments/digitise_marzocchi_alp3.py)).
We wrote six predictions into the
[log](../../research/heavy-hydraulics/LOG.md) before reading any coordinate.
Then we reran the same break-even on 384 cylinder-geometry readings of
measured excavator motion.

| | Casappa KAPPA 30 | Danfoss SNP3 | Marzocchi ALP3 |
|---|---|---|---|
| efficiency at 150 bar, 2100 r/min | 0.71 to 0.80 | 0.75 to 0.86 | **0.80 to 0.91** |
| same, at 85 L/min | 0.759 | 0.849 | 0.898 |
| smaller fixed pump wins on fuel | 9.9% | 70.1% | **99.5%** |
| efficiency where it crosses 50% | 0.828 | 0.831 | **0.819** |

The ALP3 sits well above the threshold, and the fixed pump wins in almost
every geometry, as the rule says it should. Because it sits so far above,
that check is weak on its own. The sharper test is to scale Marzocchi's
curves down until the share falls through 50%. That happens at **0.819**,
within 0.012 of the other two makers.

## What it means

- **The threshold holds out of sample.** Three makers' curves, with
  different shapes across sizes and different idle drag, flip within about
  0.01 of each other when the efficiency is read at the size the optimum
  picks. Read at the family median instead, they spread 0.029.
- **"A gear pump" is not one answer.** The three catalogues put the same
  85 L/min pump at 0.76, 0.85 and 0.90. That spread is about twelve times
  the spread of the thresholds. Whether a fixed pump beats load-sensing
  depends on which pump you buy.
- **The catalogues disagree with themselves.** Marzocchi's sizing text
  says to take 0.95 volumetric and 0.85 hydro-mechanical efficiency, about
  0.81 overall: under the threshold. Its own curves are above it. Casappa's
  text says 0.88 while its curves read 0.71 to 0.80. So what decides it is
  a measured pump on a test bench (ISO 4409), not a fourth catalogue.

Three of the six predictions held. One of the three that held was empty:
Marzocchi's torque curves turned out to be its power curves redrawn, so
they could not serve as the independent check we had planned. The refuted
ones are in the [README](../../research/heavy-hydraulics/README.md)
("Milestone 6o"). The paper draft gains section 3.7o, and its abstract now
ends on the three-maker result.

Reproduce: `python3 experiments/excavator_gear_pump_marzocchi.py` in
`research/heavy-hydraulics` (12 s; it needs numpy, h5py and the public
excavator-motion dataset).
