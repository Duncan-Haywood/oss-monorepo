---
title: "Rebar hooks in an IFC bar schedule: which end, how long, and whose number"
seo_title: "Rebar hook angle and tail from an IFC model's bars"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Reading hooks from Tekla and Revit bars: 45 of 45 named hook angles match the drawn bend once ends are matched either way round."
---

The bar schedule in [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
reads each reinforcing bar's path from the model and splits it into legs and
bends. It measures every leg out to out, the way BS 8666 schedules them.
Last week's check against the authors' own figures matched 30 of 33 leg
dimensions. All three misses were hooks. This run looked at what a hook
actually is in these files.

**What changed.** Each end hook now gets its angle and its tail: the
straight run past the bend, which is the length a bending machine is set to.
These are new columns in the CSV and show on the page under the shape. A
hook is either an end bend past 90 degrees on a short end leg, or an end the
file itself calls a hook. Tekla writes `HOOK_START_ANGLE` and
`HOOK_END_ANGLE` on every bar, and Revit writes `ISOCD3766BendingStartHook`
and `...EndHook`. Both name 90-degree hooks too, which you can't tell from a
plain leg by geometry alone.

**Which end is the start?** Not always the end that's drawn first. Tekla
lists L-bar mark 21's long leg as A (4,650 mm), then the 190 mm leg as B,
but draws the 190 mm leg first. Read naively, the file's hook angles matched
the drawn bends on 42 of 45 ends. Matching the two ends either way round
(the way whose angles agree, else the way whose hooks are the shorter
legs) brings it to **45 of 45** across three Tekla exports and one Revit
export.

**What the tails show.** Every 135- and 180-degree hook in these files has
a 48 mm tail. That's 6 bar diameters on the 8 mm stirrups and 4 on Revit's
12 mm bar. The 180-degree one is shorter than ACI 318's minimum for that
hook (the larger of 4d and 65 mm), and the schedule now notes that, naming
the standard rather than judging the project's own code. Some of Tekla's
90-degree "hooks" on U-bars run down to a 7 mm straight end. The old
out-to-out figure (65 mm) hid that.

**Whose number?** The Tekla stirrup's hook dimension E is 64 mm, but the
drawn tail is 48 mm. Last week's write-up called E the straight part, and
that was wrong. E is still Tekla's own figure: its length field sums
A + B + C + D + 2E = 1,688 mm and rounds down to the 1,680 it states. Revit's
hook parameter A is 114.3 mm (4.5 inches) on an 8 mm stirrup hook and on a
12 mm 180-degree hook alike, so it doesn't follow the drawn bar. We report
the drawn tail and keep the file's figure beside it. One more Tekla
135-degree hook of another size would tell which rule gives E.

The full method and numbers are in the venture's
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/rebar-hooks-2026-11-23.md).
The schedule is an estimate from the model's geometry and isn't a substitute
for the engineer's or bending shop's own schedule.
