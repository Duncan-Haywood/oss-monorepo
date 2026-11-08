---
title: "How many hurricane ties does a roof need? A takeoff that counts them from your engineer's numbers"
date: 2026-11-08
tags: [construction, roofing, wall-framing-takeoff]
description: "The roof tool now turns a typed uplift pressure and a connector's rated capacity into connectors per rafter end and a total to order."
---

A roof takeoff lists rafters, sheathing and shingles, then stops where the metal begins. Hurricane ties and similar roof-to-wall connectors are small, cheap and missed on bids, and a short order stops the crew for a day.

`roof.uplift: {pressure, capacity, deadLoad?, connector?}` fills that gap for gable and truss roofs. The load at each rafter or truss end is (pressure - deadLoad) x spacing x (half the span + the eave overhang). The connectors per end are that load divided by one connector's rated capacity, rounded up, and the total is that count times every end. It also reports how much of the rating is used and the widest spacing one connector would hold.

Worked example, a 28 ft wide roof, 12 in overhang, rafters at 16 in, 20 psf uplift, 5 psf dead load, 175 lb connectors: 15 psf x 1.33 ft x 15 ft = 300 lb per end, so two per end, and 124 for the 62 rafter ends.

The pressure and the capacity are yours to type, from your engineer's design and the maker's table; the tool ships neither and refuses to run without them. Limits: the whole plane's uplift is taken at the wall, which errs high; hip roofs are skipped with a note; the wall-to-foundation load path is not checked. The tests are hand sums; no real roof has been compared.
