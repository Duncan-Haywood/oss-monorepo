---
title: "Fuzzing the HVAC, plumbing and wall-tile takeoffs"
date: 2026-11-06
---

The three newest rough-in modules in wall-framing-takeoff had only hand-counted
tests. A new property test (`rough-in-fuzz.test.mjs`) now feeds each one 400
random inputs, with junk types such as NaN, strings and objects mixed in. Every
input must either be refused with a reason or order whole sticks, coils, rolls
and boxes that cover the typed lengths and areas, and the text report must
render. All three passed on the first run, so the engines hold up. The refusal
paths are exercised too, and a bad future edit to the rounding would now fail.
