---
title: "A unit slip that allowed 666 volts on a 600 volt inverter"
seo_title: "PV string sizing: a mV vs % slip and the overvoltage it hid"
date: 2026-11-14
tags: [redteam, solar, testing, pv-string-sizer]
description: "A -0.27 coefficient typed with mV selected let the PV String Sizer allow 12-module strings at 666 V cold Voc on a 600 V inverter. Now it is refused."
---

The [PV String Sizer](../../ventures/pv-string-sizer/) works out how many solar modules can go in one series string. The longest string is set by the open-circuit voltage (Voc) on the coldest morning, because module voltage rises as cells cool. The temperature coefficient decides how much it rises. Datasheets give that coefficient one of two ways: as a percentage per degree (about -0.27 % per °C) or in millivolts per degree for the whole module (about -133 mV per °C). The tool has a selector for each.

## The slip

Today's red-team run found what happens if someone leaves the percentage value in the box and selects mV. The tool read -0.27 as -0.27 mV per degree. That is about 0.001 % per degree, roughly 250 times too small. On the tool's own example module (49.5 V Voc, a -20 °C record low, a 600 V inverter):

- with the correct coefficient, the cold Voc is 55.51 V per module and the longest string is **10** modules (555 V);
- with -0.27 read as mV, the cold Voc is 49.51 V and the tool offered **12** modules. At the real cold Voc, 12 modules make **666 V**.

No error, no warning. A typo like -0.0027 % did the same. The tool already rejected values that were too large (below -2 % per degree, the opposite slip). It never checked for values that were too small, and it never checked the mV unit at all. Too small is the dangerous direction, because it raises the voltage limit.

## The fix

Both coefficients are now converted to percent of the module's STC voltage, whichever unit was typed, and checked against one range. Anything smaller than 0.1 % per degree in magnitude is refused with the reason: real crystalline, heterojunction and CdTe modules sit between about -0.22 and -0.5 % per degree. Anything beyond 2 % per degree is still refused, now in mV too: -1340 mV on a 49.5 V module is -2.7 %. A real low-coefficient module at -0.22 % still passes, as does -133 mV.

The test that reproduces the 12-module answer was written first, failed, and now passes.

## How well do the tests catch bugs?

The same run seeded 22 small faults into the tool's engine (a `<` turned into `<=`, a 45 into a 46, and so on) and ran its test suite against each one. The suite caught 8 of the 21 that change behaviour: **38 %**. The missed ones were boundaries nobody had pinned: a string window exactly one length wide, an exact division in the shortest-string count, the default of one MPPT input, the tie-break that prefers a string that stays in the MPPT window on cold mornings over a longer one. Twelve new tests now catch all 21. The 22nd fault cannot change any result: the module count is checked to be positive before the line it mutated.

As always, the tool only does arithmetic on the numbers you type. Your code edition, the authority having jurisdiction and the inverter maker's own sizing tool decide what is allowed.
