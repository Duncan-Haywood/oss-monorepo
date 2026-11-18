---
title: "A gear pump the rule never saw: Rexroth's AZPG needs the second number"
seo_title: "Gear pump efficiency and drag for excavators: a held-out maker test"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, out-of-sample]
description: "A fifth gear-pump family, from Rexroth's AZPG data sheet, crosses at 0.804. Efficiency plus drag predicts that within 0.005; efficiency alone misses by 0.017."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks which hydraulic circuit a small shop should build into a
small excavator to burn the least fuel. Its paper ends on a rule about the
fixed gear pump the builder would fit. In half of 384 measured
cylinder-geometry readings, a smaller fixed pump on an open-centre valve
beats load-sensing once that pump's overall efficiency at 150 bar and
85 L/min passes **0.821**. Earlier today a second number was added:
each kilowatt of no-load drag at 85 L/min moves that threshold by about
0.019. As a formula, E<sub>50</sub> = 0.8277 + 0.0187 (kW &minus; 3.57).

Both numbers came from the same four pump families: three makers'
catalogues (Casappa, Danfoss, Marzocchi) and one bench-tested unit. The
pooled fit, the choice of the 150 bar index and the curve form were all
made while looking at those four. So the honest test is a family nobody
had looked at.

## The fifth family

Bosch Rexroth's data sheet for its AZPG cast-iron gear pumps
(RE 10093/2019-09-27) draws flow at 20 bar and at the maximum
intermittent pressure, plus drive power at 50 to 280 bar, against speed,
for ten sizes from 22.5 to 63 cm³/r. The charts are vector art, so they
can be read exactly: 1,684 points, with axes fixed by the charts' own
grid lines (largest residual 0.12 kW). Six predictions went into the
[log](../../research/heavy-hydraulics/LOG.md) before the PDF was
digitised.

What came out:

| | AZPG | the four earlier families |
|---|---|---|
| overall efficiency at 150 bar, 85 L/min | 0.912 | 0.759 to 0.913 |
| no-load drag at 85 L/min | 2.58 kW | 2.85 to 3.64 kW |
| 50% crossing (own shape, own drag) | **0.8040** | 0.8116 to 0.8297 |

The AZPG is the most efficient catalogue yet, as good as the one bench
unit. It also drags the least in neutral.

## The test

| rule (as committed, not refitted) | predicted crossing | error |
|---|---|---|
| one number: 0.8212 whatever the pump | 0.8212 | +0.0172 |
| two numbers: 0.8277 + 0.0187 (2.58 &minus; 3.57) | 0.8091 | **+0.0052** |

The one-number rule had claimed the crossing moves by no more than 0.015
with a pump's curve shape or drag. That held for the four families it
was built on. It does not hold for the fifth. The two-number rule lands
within 0.005, about its in-sample error.

Swapping halves shows why. With the Casappa catalogue's drag, the AZPG's
efficiency map crosses at 0.8207, 0.0005 from the pooled number. Put the
AZPG's drag on the Casappa map instead and the crossing falls to 0.8108.
The cause is the drag, not the shape of the map.

## What it means for a builder

Read two numbers off a gear pump's data sheet: its efficiency at 150 bar
and its power at zero pressure. The AZPG at its catalogue efficiency
makes the smaller fixed pump win in all 384 geometries. Other makers'
catalogues read lower than their own bench tests (Casappa's by 0.15), so
the paper still asks for a test of the pump, not just its data sheet.

Two predictions failed. The AZPG's efficiency (0.912) sits above the
catalogue range we expected, and the one-number rule missed by more
than 0.015. Four held, one of them by only 0.08 kW (the drag
prediction). The limits are the usual ones. This is one more family of
typical curves at 50 C, not a test report. The copy of the data sheet
came from a distributor mirror, with its sha256 recorded. And the
two-number rule's intercept is still Casappa's, so this is one
confirming point, not a refit.

Code: [`digitise_rexroth_azpg.py`](../../research/heavy-hydraulics/experiments/digitise_rexroth_azpg.py),
[`gear_pump_rexroth.py`](../../research/heavy-hydraulics/experiments/gear_pump_rexroth.py),
results in [`gear_pump_rexroth_results.txt`](../../research/heavy-hydraulics/experiments/gear_pump_rexroth_results.txt).
The paper's manuscript now says this in sections 3.5 and 4.
