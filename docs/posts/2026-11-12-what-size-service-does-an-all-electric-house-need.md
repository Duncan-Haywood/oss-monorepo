---
title: "What size service does an all-electric house need? The backup strips decide"
seo_title: "NEC 220.82 service sizing: an all-electric worked example"
date: 2026-11-12
tags: [service-load-check, ventures, construction, energy]
description: "NEC 220.82 for a whole house, now in the service load check: in its all-electric example the backup heat strips move the answer from 125 A to 175 A."
---

Yesterday's [service load check](https://marisstella.app/service-load-check/) answered one question: can an *existing* service take an EV charger or a heat pump without an upgrade? It ran the two code methods for that, NEC 220.83 from an appliance list and 220.87 from a year of meter data. Its README listed what it left out, and the first item was 220.82, the optional calculation that sizes a dwelling's whole service. That is the question a builder, or anyone replacing a panel, actually asks: *how big does this service need to be?*

It now runs 220.82 as well, next to the other two.

## How 220.82 differs

It counts everything at once, existing and new alike. General loads (3 VA per square foot, 1,500 VA per kitchen and laundry circuit, the nameplate of every fixed appliance and motor) take the first 10,000 VA at 100% and the rest at 40%. 220.83 starts the 40% at 8,000. Heating and cooling are then added as the *largest* of six selections:

1. cooling at 100%;
2. a heat pump with no electric backup at 100%;
3. a heat pump compressor at 100% plus backup heat at 65%, with the compressor left out if the controls lock it off while the strips run;
4. electric space heat at 65% with fewer than four separately controlled units;
5. the same at 40% with four or more;
6. thermal storage heat at 100%.

The tool shows every selection that applies, marks the one used, and gives the smallest standard rating (the 240.6(A) steps, 100 A minimum) that covers the total.

## The example

The new [guide](https://marisstella.app/service-load-check/what-size-electrical-service.html) works through an invented 2,400 sq ft all-electric house: induction range, dryer, water heater, dishwasher, disposal, a 48 A EV charger, a heat pump with a 21 A minimum circuit ampacity, and 10 kW of backup strips. It's a placeholder, not a real or typical house. The engine's figures:

| Variant | Calculated load | Smallest rating that covers it |
|---|---|---|
| Heat pump plus 10 kW strips | 36,228 VA, 150.9 A | 175 A |
| Same, compressor locked out while strips run | 31,188 VA, 129.9 A | 150 A |
| No strips (heat pump carries the house) | 29,728 VA, 123.9 A | 125 A |

The EV charger is the single largest nameplate in the house, 11,520 VA, but it sits in the general loads, where everything over 10 kVA counts at 40%. The strips go in at 65% on top of the compressor. Across these three variants, the backup heat decides between 125 A and 175 A. Nothing else does.

That doesn't mean the house should get a 125 A panel. 175 A panels are uncommon, so 200 A may still be the right buy. But the gap between 150.9 A and 200 A is room for later loads, not a code requirement, and the lockout setting on the thermostat is worth a sentence on the drawings.

## How it was checked

The tests work every selection by hand: cooling only, heat pump alone, heat pump with strips with and without lockout, four baseboard heaters against three, and storage heat beating air conditioning. They also run the existing-house example through 220.82, where the general loads take the 10 kVA step. Every figure in the guide is asserted against the engine's output, so the page can't drift from the code.

The factors are as I read the 2017 to 2023 NEC from published section summaries, not line by line from a licensed copy. The page and README say so. Not modelled yet: the standard method of Article 220 Part III, which some inspectors and utilities ask for instead, and the neutral calculation.

Building this turned up an older bug. On a phone the tool page scrolled sideways, 435 px of page in a 390 px screen. The appliance table sat in a scroll box, but its visually hidden labels were absolutely positioned against the page, not the box, so they pushed past its edge. One `position: relative` on the scroll box fixed it.
