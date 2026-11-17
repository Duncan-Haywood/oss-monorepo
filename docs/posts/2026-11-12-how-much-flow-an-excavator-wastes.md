---
title: "A fixed pump pushes 2.4 times the oil a measured excavator uses"
seo_title: "Excavator hydraulic flow demand vs fixed pump: measured volume ratio"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator]
description: "Joint motion from a public 7.5 t excavator dataset, turned into cylinder flow: a fixed pump sized for peak demand delivers about 2.4 times the oil used."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks which hydraulic circuit a small shop could build to get a
compact excavator closest to stock fuel use. A rule it found this week says
when a load-sensing pump stops beating a plain fixed pump with an open-centre
valve. The break-even load-sensing margin is about (r − 1) × p. Here r is the
volume a fixed pump delivers while the machine moves, divided by the volume the
cylinders actually use, and p is the pressure the surplus is pushed at.

This morning's run measured p on a real excavator: a median of 174 bar while
it moves, about five times what our force model assumed. That machine's files
have pressure but no flow, so r on an excavator was still a guess. On our
synthetic cycles r was 1.43, and on a measured wheel loader it was 1.79.

## Getting flow from joint angles

The same public dataset ([`fuxi-robot/excavator-motion`](https://huggingface.co/datasets/fuxi-robot/excavator-motion),
CC BY-NC-SA 4.0) has a second folder: ten truck-loading recordings, 16
minutes in all, of what the file names suggest is a 7.5 t class XCMG
excavator. It records joint angles and joint speeds and nothing else. A
cylinder's flow is its piston area times its rod speed. XCMG's XE80E brochure
lists the cylinders (boom 110 × 75 × 922 mm, arm 95 × 60 × 885, bucket
85 × 55 × 742), and a dealer listing for the XE75U gives the same sizes to the
millimetre. We set each cylinder's lever to its stroke divided by the
joint's observed travel, and charged swing at a share of pump flow.

We wrote five predictions down before reading the data. Three were wrong:

- **Which way each cylinder extends matters a lot.** Filling the full bore
  takes about twice the oil of filling the rod side. Across the eight ways to
  assign directions, r moved by 72%, where we had predicted under 15%. The
  dataset's own visualisation script settled the boom and the arm: its forward
  kinematics show a larger boom angle lowers the boom and a larger arm angle
  pulls the arm in. With those two fixed, the bucket's direction moves r by
  under 1%.
- **Peak demand ran past the pump.** With swing counted, the 99th percentile
  of demand came out at 240 L/min, above the machine's 219 L/min pump.
  Without swing, the cylinders alone came to 218.8 L/min. That is the pump's
  published maximum, matched to 0.1% with nothing fitted, which is what you'd
  expect from a machine whose top speed is set by its pump.
- **r was higher than we guessed.** We registered 1.43 to 2.5.

## What came out

The margin column puts each r into the rule at one pressure, 130 bar. That is the 49 t machine's working share of its top pressure, applied to the 7.5 t machine's 316 bar maximum. The 0.78 covariance factor comes from the loader.

| | Volume ratio r | Break-even margin by the rule, at 130 bar |
|---|---|---|
| Synthetic excavator cycles | 1.43 | 44 bar |
| Measured wheel loader | 1.79 | 80 bar |
| Measured excavator, p99-sized fixed pump | **2.38** (2.34 to 2.42 over files) | 139 bar |
| Same, over 384 lever, sign and swing cases | 1.95 to 3.08 | 96 bar at the lowest |

The excavator moves in 97.5% of samples, but its demand is peaky: a median
of about 90 L/min against a 99th percentile of 240 L/min. A fixed pump big
enough for the peaks spends most of the cycle pushing oil the work doesn't
need, against whatever pressure the heaviest function is holding. Load-sensing
pumps are sold with margins of 14 to 25 bar. On this data the margin at which
load-sensing would stop winning is 70 to 140 bar, so it wins with plenty to
spare.

## What this does not show

The flow comes from a 7.5 t machine and the pressure from a 49 t machine, so
the two halves of the rule are not from one excavator. Constant levers are a
rough stand-in for the real linkage, and the bucket's four-bar is the least
linear of the three. At 10 Hz short peaks are missed, and those would push r
higher. We still have no measured fuel record of an excavator, so the
programme's main test (H4) remains open.

Script and full output:
[`measured_excavator_flow.py`](../../research/heavy-hydraulics/experiments/measured_excavator_flow.py),
[results](../../research/heavy-hydraulics/experiments/measured_excavator_flow_results.txt).
The prediction log, with the three misses, is in
[`LOG.md`](../../research/heavy-hydraulics/LOG.md).
