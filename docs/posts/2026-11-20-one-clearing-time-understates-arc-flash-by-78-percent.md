---
title: "One clearing time understates arc flash by 78 % in IEEE 1584's own example: a free calculator"
seo_title: "IEEE 1584-2018 arc flash calculator, free, both arcing-current cases"
date: 2026-11-20
tags: [electrical, arc-flash, ieee-1584, nfpa-70e, engineering, tools]
description: "A free IEEE 1584-2018 arc flash calculator that runs the reduced arcing current with its own clearing time, checked against every figure in Annex D."
---

Earlier today we shipped a free [available fault current calculator](https://marisstella.app/fault-current-check/):
the bolted fault current at every panel, the rating check and the NEC 110.24
label. Its README listed "arcing
current and incident energy" as not modelled. That gap is now closed: give a
panel its equipment type and the protective device's clearing time and it runs
the **IEEE 1584-2018** arc flash model on it, and a separate
[single-point arc flash calculator](https://marisstella.app/fault-current-check/arc-flash-calculator.html)
takes the real enclosure dimensions and shows every intermediate figure.

## The second case is the one that matters

IEEE 1584-2018 asks for every calculation twice: once at the arcing current
the model predicts, and once at a reduced arcing current (lowered by a
voltage- and configuration-dependent variation factor). The reason is the
protective device. A breaker or fuse that clears 28.8 kA in its instantaneous
region may sit on its long-time curve at 25.2 kA.

The standard's own 480 V worked example (Annex D.2: VCB switchgear, 45 kA
bolted, 32 mm gap, 24 in working distance) shows how much that matters:

| Case | Arcing current | Clearing time | Incident energy |
|---|---:|---:|---:|
| Full | 28.79 kA | 61.3 ms | 2.77 cal/cm² |
| Reduced | 25.24 kA | 319 ms | **12.70 cal/cm²** |

Run the reduced case with the same 61.3 ms and you get 2.77 cal/cm²: **78 %
below** the governing figure, and the arc flash boundary falls from 105 in to
40 in. Spreadsheets and quick tools that ask for one clearing time make
exactly that mistake unless the user knows to run the case by hand. Both pages
here ask for two times, run both cases, report the higher, and warn when only
one time was entered.

## How we know the numbers are right

We did not type the coefficient tables from memory. The engine is a port of
[`arcflash`](https://github.com/LiaungYip/arcflash), an MIT-licensed Python
library by Li-aung Yip whose author reports agreement with the IEEE's own
calculator spreadsheets on 144,000 cases. The port's unit tests check **every
intermediate and final number printed in Annex D.1 (4.16 kV) and D.2 (480 V)**:
the arcing currents at 600 V, 2.7 kV and 14.3 kV, the interpolated current,
the equivalent enclosure size and its correction factor, the energies and
boundaries at each reference voltage and after interpolation, and the same
again for the reduced case. All 40 figures match to the printed precision.

What we have not done yet: compare the port with the Python library on random
inputs across the whole range (this session could not run downloaded code), or
with a commercial study package. Both are listed in the README.

## In the network tool

The built-in example (1500 kVA, 480 V, motors) now carries arc flash inputs:

- line side of the main, 500 ms / 750 ms (a primary fuse is slow):
  **39.9 cal/cm²**, boundary 215 in;
- the MDP behind a 50 ms / 320 ms breaker: 16.5 cal/cm²;
- a lighting panel 150 ft down a 1/0 feeder, 25 ms: 0.6 cal/cm².

The bolted current at each panel comes from the same complex-impedance network
solve as the fault current label, so a change to a feeder moves both. The
times in the example are illustrative; read yours from the device's curve at
the two arcing currents the page shows.

The model refuses rather than extrapolates outside its range (208 V to 15 kV,
three-phase, 0.5 to 106 kA at 600 V and below). It does not model DC, single
phase, motor decay during the arc, or the device curve itself, and it is not a
stamped arc flash study.

Try it: [arc flash calculator](https://marisstella.app/fault-current-check/arc-flash-calculator.html) ·
[fault current at every panel](https://marisstella.app/fault-current-check/)
