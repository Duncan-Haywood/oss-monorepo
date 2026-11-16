---
title: "Can a 5-inch quadrotor hover 15 minutes on LiPo? A sizing model checked against 405 batteries"
date: 2026-11-16
tags: [research, robotics, drones, quadrotor, sizing, batteries, motors]
seo_title: "Can a 5-inch quadrotor hover 15 minutes on LiPo?"
description: "Listed battery, motor and efficiency figures break a drone sizing model: no 5-inch design closes at 15 min on LiPo, and 28 of 48 tuned designs never closed."
---

Every mass in our [rotor-cant programme](../../research/codesign-cant/README.md) comes from one small loop. Pick an arm and a propeller. Size the battery for 15 minutes of hover. Size the motors for twice the hover thrust. Add the frame, a 250 g payload and the electronics. Repeat until the mass stops changing. The loop leaned on three constants nobody had checked: 150 Wh/kg for the battery, a motor-mass law of 0.045 (T<sub>max</sub>/9 N)<sup>1.2</sup> kg, and a propulsive efficiency of 0.65 × 0.75. Yesterday's run found the loop multiplies any change in frame mass 6 to 15 times, so this run went and checked the constants.

## What the listings say

Six FPV shops and SunnySky's own store publish their catalogues as JSON. From them we took 405 battery listings and 29 motor pages that carry the maker's bench tables (5,292 rows of propeller, thrust and watts). Each row in [`data/components/`](../../research/codesign-cant/data/components/) keeps its URL.

| Constant | Assumed | From listings |
|---|---|---|
| LiPo pack specific energy | 150 Wh/kg | **132 Wh/kg** (median of 140 packs, 3-6S, 1-10 Ah) |
| Li-ion pack specific energy | — | **210 Wh/kg** (24 packs) |
| Motor mass at 9 N maximum thrust | 45 g | **29 g** (fit over 33 motors; the old law is 1.7× the listed mass at the median motor) |
| Propulsive efficiency, 5-inch propeller, half thrust | 0.4875 | **0.426** (ideal momentum power over electrical watts) |

Two of the three assumptions were optimistic and one was pessimistic. Lighter motors help. Weaker batteries and lower efficiency hurt.

## The loop never finished

While wiring in the new constants we found a bigger problem in the loop itself. It ran 60 damped iterations from 1 kg and returned wherever it had got to. Close to the point where a design stops closing, 60 steps aren't enough. Past that point there is no answer at all, but the loop still returned a number.

Solved exactly, 28 of the programme's 48 tuned designs have **no fixed point at 15 minutes**. No vehicle with that arm, propeller and cant can carry its own battery for that long. That group includes all six heavy, nearly crash-free designs that earlier milestones counted as their most robust. The optimiser had put every design right at the edge, where the unfinished loop reported the most mass. Every design's longest closing endurance falls between 14.6 and 15.8 minutes.

## So, 15 minutes on LiPo?

With all three listed constants, **no design closes on LiPo**: the longest endurance any of them reaches is 11.9 to 13.0 minutes. On Li-ion every design closes, at about 0.75 kg, half the mass the tuner chose.

Those lighter vehicles, flown on gains tuned for the heavy ones, crash much more often. With the centre of pressure at twice its nominal lever and a 45° tilt limit, the Li-ion versions crash on 20 to 33 more of 64 flights per design. That says what the old tunes do on the new vehicles. It doesn't say what a retuned design would do, and that is the next step.

One earlier result survives. Lengthening the arm still lowers crashes steadily under the new closure (210 → 157 of 320 flights from 105 to 145 mm), so the shape of milestone 7o's arm result holds. Its level does not.

## For anyone sizing a small drone

Budget about 132 Wh/kg for LiPo packs and about 0.43 for 5-inch propulsive efficiency at cruise thrust, not the textbook 150 and 0.49. At 5 inches, 15 minutes of hover with a 250 g payload takes Li-ion. And if your sizing code iterates, check that it converged rather than stopped.

*Simulated; built from listings, not measurements. Battery capacities are as labelled, the efficiency at 5 inches comes from three motors, and the designs were not retuned. Full log: [`LOG.md`](../../research/codesign-cant/LOG.md), milestone 7q.*
