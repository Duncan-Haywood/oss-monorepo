---
title: "'Over 40 in.' when we had tried 60: three quiet faults in our duct sizer"
seo_title: "Duct sizing calculator edge cases: oversize trunks, missing return trunks, and a room called toString"
date: 2026-11-11
tags: [hvac-load-calc, ducts, javascript, mutation-testing]
description: "A red-team run on the free HVAC load and duct calculator found a hard-coded size in an error message, a return trunk that vanished without a word, and a JavaScript object-key trap."
---

Today's red-team run seeded 18 faults into the two engine files of the
[HVAC load and duct calculator](../../ventures/hvac-load-calc/): `load.mjs`, which works out
room heating and cooling loads, and `duct.mjs`, which sizes the round ducts from those
airflows by friction rate (Darcy-Weisbach with the Colebrook friction factor). The tests
caught 8 of the 10 faults in the load engine but only 3 of the 8 in the duct sizer.

One of the duct faults that got through can't change anything a user sees. It breaks the
early exit in the Colebrook iteration, but the loop has converged long before its 50-pass
cap, so the answer moves by less than 10⁻¹². The other six were real holes:

- nothing checked the framed-floor U-factor against a hand calculation;
- the slab-perimeter and return-airflow bounds could drift and no test would notice;
- no test picked a 14 in. round or a 40 in. trunk, so either size could quietly change in its list;
- the label saying whether friction or velocity set a size wasn't tested at the edge where
  the next size down meets the friction rate (within the 10⁻⁹ tolerance) but runs too fast.

Each now has a test that fails with the fault in place. That makes 17 of 17 counted faults
caught, up from 11.

## Three real defects

Reading the duct code for inputs someone might actually type turned up three bugs. Each
was reproduced with a failing test before the fix.

**"Needs more than a 40 in. round", after trying 60.** A trunk can use every size in your
list plus the stock large rounds up to 40 in. If you list sizes up to 60 in. and a trunk
still doesn't fit, the warning, the text report and the table on the page all said
"over 40 in.", which was a size the code had already gone past. Now they name the largest
size actually tried, and the result records it as `settings.trunkLargestIn`.

**A return trunk that vanished.** If you have two or more returns, the sizer adds a return
trunk to carry their combined airflow. When no size could carry it, the trunk came back as
`null` with no warning, so the report and page simply left it out. Leaving it out looks the
same as not needing one. Now it's listed with no size and a warning, the same way an
oversize supply trunk was already handled.

**A room called `toString`.** The duct design looks up each room's effective length in a
plain JavaScript object keyed by room name. A room named `toString` or `constructor` gets
back a built-in function instead of `undefined`. That function stopped the default length
from applying, and the design was refused with "total effective length must be a number".
The lookup now uses `Object.hasOwn`, the same guard the load engine already used for its
own tables. It's an unlikely room name, but this is how a user-keyed lookup goes wrong in
JavaScript, and it's a one-line fix.

## What it means for the numbers

None of the three changed a duct size the calculator printed. Two were messages that were
wrong or missing at the edge of the size list, and one was a refusal that shouldn't have
happened. The calculator remains an estimate, not an ACCA Manual D design, and a qualified
designer sizes ducts for a permit.
