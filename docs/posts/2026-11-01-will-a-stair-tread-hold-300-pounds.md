---
title: "Will a stair tread hold a 300 lb point load between its stringers?"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff's stair module now checks one tread board in bending and deflection under a typed concentrated load at midspan between stringers.
---

Stringer strength gets the attention, but the part a foot lands on is the tread board. The model residential code asks a tread to carry a concentrated load at midspan within a deflection limit, and the span is set by the stringer spacing the takeoff has already worked out.

`treadCheck: {point, Fb, E, deflLimit?}` on a stair takes the load in pounds, the allowable bending stress and E, all typed, none shipped. One board takes the whole load (the cautious case, no sharing with its neighbour), simply supported between two stringers: M = PL/4, bending stress M/S, deflection PL³/48EI against L/240 unless you type another ratio.

Hand arithmetic, as in the tests: a 2x12 tread (1.5 x 11.25 in actual) over a 16 in span under 300 lb gives 284 psi in bending and 0.006 in of deflection against 0.067 in allowed. A 1 in x 5.5 in deck board over the same span gives 1,309 psi, which fails a typed 1,000 psi, and the text report says so and suggests thicker treads or closer stringers.

This is checked against hand sums only, not a tread test, and it is a first pass for a framer, not an engineer's stamp.
