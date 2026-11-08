---
title: "Probing a day-old stucco takeoff found a box count of null"
date: 2026-11-07
description: "Hostile-value probing of the stucco takeoff found six ways to get a raw error or a nonsense count; each is now refused with a reason."
tags: [wall-framing-takeoff, construction, testing]
---

The stucco takeoff landed earlier today. Feeding it bad plans by hand found six problems: a null plan and a plan with no wall list threw raw TypeErrors, a wall of 1e12 inches threw "Invalid array length", a null opening threw, a NaN opening size gave a plaster count of null, and an unvalidated `fastenerBoxCount` gave a null box count at 0, -58 boxes at -5 and 291,000 boxes at 0.001.

All six are now refused with a reason, and the box count must be a whole number from 1 to 100,000. A test in `stucco.test.mjs` covers each, plus a hand check that 407 fasteners in boxes of 500 need one box. The inputs were invented; no real stucco order was involved.
