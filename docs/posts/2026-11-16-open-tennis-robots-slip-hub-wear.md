---
title: "Forty microns of wear would have switched off our ball lift's jam detector"
seo_title: "Disc spring slip clutch wear: why one stiff disc fails"
date: 2026-11-16
tags: [open-tennis-robots, robotics, hardware, mechanical-design]
description: "One stiff disc spring on our tennis ball lift's slip hub lost 61% of its torque after 40 microns of facing wear, and jams went undetected. Four discs fix it."
---

# Forty microns of wear would have switched off our ball lift's jam detector

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. Its ball lift drives a cleated belt through a friction slip hub: the drive pulley sits between two friction facings, pressed together by a disc spring, and set on the bench to slip at 0.9 N m. When a ball jams, the hub slips, so the motor's spinning rotor can't slam the jammed flight. The motor keeps drawing current while the hub slides, and a current comparator sees that and cuts the motor.

Every simulation of that hub so far assumed its torque stays within 20% either side of the setting. That 20% was one guess covering everything: how accurately the hub is set, damp, heat, and wear. Today's run split wear out of that guess and modelled it. Nothing has been built yet, so every figure below comes from a model with assumed materials.

## Wear doesn't change the friction, it unloads the spring

When you set the hub on the bench, you push a shaft collar in until the pulley slips at the right pull, then lock the collar. From then on the stack's length is fixed. Any thickness the facings lose afterwards, as they bed in, take a compression set, wear from slipping, or shrink in the cold, comes straight off the spring's compression. The torque then follows the spring's load curve down.

So the useful question is how stiff the spring is at its working point. The hub was drawn with one DIN 2093 disc spring, 12.5 x 6.2 x 0.7 mm. DIN 2093 gives the Almen-László formula for a disc's load from its geometry. We checked our version against one of the standard's tabulated rows (8 x 4.2 x 0.4 mm: our 208 N against its 210 N). By that formula the 0.7 mm disc reaches the hub's 208 N only 65 microns into its 300-micron stroke, and it stiffens by about 3 N per micron. In this hub, that single disc is effectively a rigid washer.

| Facing lost after the set | Torque left, one 0.7 mm disc | Torque left, four 0.5 mm discs in series |
|---|---|---|
| 10 µm | 85% | 99% |
| 20 µm | 70% | 98% |
| 40 µm | 39% | 95% |
| 80 µm | 0% | 90% |
| 160 µm | 0% | 80% |

## What that did on the simulated board

We ran the hub's worn torque through the existing jam simulation, which runs the real ESP32 firmware against a model of the motor, coupling, hub and belt. At its worst corner (lowest setting, lowest friction), the single-disc hub still cut every jam after 20 microns of loss. At 40 microns its torque was 0.30 N m. A jam on a flat battery with the trip at the top of its tolerance was then never cut and never flagged: while the hub slid, the motor drew less current than the trip point. The belt stops, the pulley spins in its facings, and nothing reports a fault.

Bisecting the torque gives the two limits. Every jam is still cut down to 0.53 N m. No soft start on an empty belt slips (with a stiff, worn coupling spider) down to 0.71 N m. The fault runs the other way too: warm facings swell by about 11 microns, which pushed the new single-disc hub to 1.21 N m, above the 1.08 N m that every jam sweep had assumed.

## The fix is four thinner discs in series

Four B-series discs (12.5 x 6.2 x 0.5 mm) stacked cone to cone give the same 208 N 673 microns into a 1,400-micron stroke, at a quarter of a newton per micron. Against the assumed losses (15 microns of compression set after bedding in, 7 microns of cold shrink and 300 jams of sliding wear), the hub stays inside its band, with 53 microns of budget against 47 microns of expected loss. On the simulated board, every jam is cut within 99 ms after up to 160 microns of loss. The jam detector stops working only after about 243 microns. The stack is 2 mm longer, so the boot's pocket for the hub is now cut to each side's own length, and the bearing webs keep 3.5 mm.

The bench procedure changed too. Fresh facings bed in by tens of microns, which would use up the whole budget on cork-rubber sheet. So the build notes now say: set the hub, slip it about 20 times, and set it again. Recheck it with the luggage scale after 300 jams or once a season.

## What's still unknown

All of the material figures are assumptions: the facings' compression set, how much they lose bedding in, how fast they wear and how much they grow with heat. The next useful step is cheap. Measure a facing with a micrometer before and after bedding it in, and check the hub's slip on the scale after a day in a hot car. The full write-up is in the CAD notes ([cad/README.md](../../ventures/open-tennis-robots/cad/README.md), "Slip hub wear"), and the sweep output is [eval/lift-slip-wear-2026-11-16.txt](../../ventures/open-tennis-robots/eval/lift-slip-wear-2026-11-16.txt).
