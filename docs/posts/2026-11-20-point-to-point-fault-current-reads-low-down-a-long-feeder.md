---
title: "Point-to-point fault current reads low down a long feeder: a free calculator for the NEC 110.24 label"
seo_title: "Available fault current calculator: every panel, 110.24 label"
date: 2026-11-20
tags: [electrical, fault-current, short-circuit, nec-110-24, engineering, tools]
description: "A free available fault current calculator: every panel from the transformer down, the kA rating check, the 110.24 label, and where point-to-point reads low."
---

Service equipment in other than dwelling units has to carry a field-marked
label with the maximum available fault current and the date it was worked out
(NEC 110.24). The same number decides whether every breaker and panelboard
downstream is rated for what can reach it. The usual hand method is
point-to-point: start from the transformer's fault current and multiply down
each feeder by 1 / (1 + f).

We built a free calculator that solves the same system two ways, and the
comparison turned up something worth knowing.

## The example

A 1500 kVA, 3.5 % transformer at 480 V. Full-load current is 1,804 A, so on an
infinite bus the secondary fault current is 1,804 / 0.035 = 51,549 A. Reduce
the impedance 10 % for the nameplate tolerance and add four times 1,804 A of
running motors, and the service sees **64,493 A**; the label reads 64,500 A.

Downstream:

| Panel | Nameplate %Z, no motors | With tolerance and motors | Magnitude sum | Rating |
|---|---:|---:|---:|---:|
| Service | 51,549 A | 64,493 A | 64,493 A | 65 kA |
| MDP (25 ft, 6 x 400 kcmil) | 49,031 A | 60,598 A | 60,491 A | 65 kA |
| LP-1 (150 ft of 1/0 beyond) | 12,515 A | 13,008 A | 12,281 A | 10 kA |
| LP-2 (75 kVA, 4.5 % to 208 V) | 4,315 A | 4,795 A | 4,747 A | 10 kA |

LP-1, a lighting panel with a 10 kA rating, is over whichever way you count.

## Where point-to-point reads low

The point-to-point multiplier f = 1.732 x L x I / (C x n x E) works out to
adding each impedance's magnitude: the cable's |Z| is added to the source's
|Z| as if both pointed the same way. They don't. The service source is X/R 6,
mostly reactance; 150 ft of 1/0 copper is about 0.102 ohm of resistance
against 0.063 ohm of reactance per 1000 ft, mostly resistance. Their complex
sum is shorter than the sum of their lengths, so the real fault current is
higher: 13,008 A at LP-1 against 12,281 A by magnitudes, **5.6 % low**. Close
to the transformer, where one impedance dominates, the two agree (0.2 % at the
MDP).

5.6 % is small next to the uncertainty in a utility's figure, but it always
errs in the unsafe direction for an equipment rating check, and it grows where
the answer matters most: at the small panels at the end of long feeders, which
are the ones with 10 kA and 14 kA ratings. The test suite checks that the
calculator's magnitude sum reproduces the point-to-point f and M formulas
exactly, for a feeder and for a downstream transformer, so the comparison is
like for like.

A second thing the table shows: the impedance tolerance moved LP-2 by 11 %
(4,315 A to 4,795 A), more than it moved the service, because LP-2's own
75 kVA transformer dominates its impedance and the allowance applies to it as
well.

## What the tool does

[Available Fault Current Calculator](../../ventures/fault-current-check/index.html)
takes the service transformer (kVA, %Z, X/R, a tolerance allowance and an
optional utility fault MVA) or the fault figure from the utility, motor
contribution at the service, and any number of feeders, each fed from the
service or an earlier panel, with size, copper or aluminium, parallel sets,
length, steel or non-steel conduit and an optional step-down transformer. For
every panel it gives:

- the symmetrical fault current, impedances added as complex numbers;
- the magnitude-sum figure and how far it reads low;
- X/R and the peak current (IEC 60909 kappa);
- a check against the panel's kA rating;
- label text with the date you pick, and a CSV of everything.

Conductor resistance is computed from the area and the resistivity of copper or
aluminium, with the IEC 60287 skin-effect factor, not copied from a code table.
Reactance defaults to 0.050 ohm per 1000 ft (a quarter more in steel conduit)
and can be typed per feeder. It runs in the browser; nothing is uploaded.

Not modelled: ground faults and the line-to-neutral fault on a center-tapped
secondary, arc flash, generators and inverters, series ratings and fuse
let-through. A stamped short-circuit study is the document of record; this is a
check, verified by hand arithmetic and unit tests only. The worked steps are in
[the 110.24 label guide](../../ventures/fault-current-check/nec-110-24-available-fault-current-label.html).
