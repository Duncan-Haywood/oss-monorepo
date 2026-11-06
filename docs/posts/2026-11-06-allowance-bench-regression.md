---
title: "A bench that quietly stopped running: the allowance comparison"
date: 2026-11-06
description: "A framing benchmark matched an error message that had since been reworded, so one of its three houses silently dropped out. Found, fixed and pinned with a test."
---

The allowance bench in `wall-framing-takeoff` compares the counted lumber order
with two rules of thumb builders quote. For a house with a 16 ft opening it
retries with longer boards, but it detected the need by matching the engine's
error text. The engine's wording changed, the match failed, and
`node allowance-bench.mjs` printed "does not lay out" for Open House Plans 2
while the README still quoted its figures (counted 4269 ft, per-foot rule
+10.2%, on-centre +28.7%).

The fix widens the match, and a new test lays out a 20 ft wall with a 16 ft
opening both ways (refused as drawn, laid out with the 24 ft retry). The
README figures reproduce exactly. The lesson: a retry keyed on message text
needs a test, or it fails without any visible error.
