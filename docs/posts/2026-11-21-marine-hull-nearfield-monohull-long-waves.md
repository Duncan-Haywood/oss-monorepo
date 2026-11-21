---
title: "A second added-resistance formula doubles a small boat's wave loss, mostly in waves it can't feel"
seo_title: "Near-field added resistance on a 4 m boat: the long-wave residual"
date: 2026-11-21
tags: [research, marine-hull]
description: "Boese's near-field formula raises a 4 m survey boat's 30 W wave loss from 3.4% to 6.7%-8.7%, but most of it comes from long waves the formula fails to cancel."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses to head seas. Its answer so far, a 3.4% to 4.2% range loss at a 30 W payload load, rests on one added-resistance formula, Gerritsma-Beukelman (GB). The [previous step](2026-11-21-marine-hull-nearfield-pdstrip.md) built a second formula from the open PDSTRIP theory manual: Boese's near-field pressure integration, run on the same hull sections with the same motions. It moved the slender-hull tank comparison more than any motion change had. This step asked the obvious follow-up: what does it do to the boat?

**Naive answer: the loss doubles.** With the near field in place of GB, and the same measured bow-sector wave climate, the 30 W loss goes from 3.39% to 6.68% without the formula's convection term, 8.10% with Boese's mass-times-acceleration force, and 8.69% with full convection. All three were set down before the run, and two expectations failed: the near field without convection was supposed to stay inside the programme's 2.5% to 4.3% range, and its motion term was supposed to be within 30% of GB's. It came out at 2.05 times GB's.

**Where the extra comes from.** Splitting the climate-weighted integral by wavelength settles it (this split was decided after seeing the table, and is labelled post hoc). On a 4 m hull, 90.7% of the measured wave energy is at wavelengths over eight hull lengths. The boat rides those waves like a cork, and the added resistance should go to zero. GB does: 95% of its integral comes from waves under two hull lengths. The near field as implemented does not decay. At ten hull lengths it is about 300 times GB, and 42% of the no-convection formula's excess over GB comes from waves longer than eight hull lengths. One of the three terms carries the residual: the pressure force times the hull's pitch angle. Heave and pitch already follow the wave there (heave amplitude 0.997 of the wave), so this is a cancellation the implemented form misses. The prime suspect is the second-order hydrostatic term from the rotated mean pressure, which the documented formula leaves out.

**Restricted to where it was checked.** The near field was compared with tank data only on wavelengths up to two hull lengths. Using it there, and GB beyond, gives a 30 W loss of **4.12%** without convection and **5.37% to 5.77%** with it, or 4.0% to 6.2% if the cut moves between 1.5 and 3 hull lengths. So the bracket's upper end depends on which formula, and which convection term, you believe. The same term was the swing in the tank comparison.

**What doesn't move.** The ranking does not change. In all 17 rows the monohull still leads every hydrofoil case up to 200 W of payload load. The formula changes the size of the loss, not which boat to build. Next: add the missing hydrostatic term and check that the near field then decays in long waves, before rerunning the boat without the splice.

Code, numbers and the pre-registered plan are in the [research log](../../research/marine-hull/LOG.md) (milestone 7zt).
