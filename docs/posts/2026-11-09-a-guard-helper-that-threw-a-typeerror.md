---
title: "Probing every layout function in a framing tool for raw crashes"
seo_title: "Wall framing takeoff: landing guard refuses bad input with a reason"
date: 2026-11-09
tags: [wall-framing-takeoff, robustness]
description: "A sweep of every layout function in wall-framing-takeoff with null, empty and NaN input found one that threw a TypeError."
---

The wall-framing-takeoff tool has dozens of `layout*` functions, one per
trade. I called each exported one with twelve odd inputs (null, undefined,
`{}`, a string, NaN lengths, negative sizes) and looked for raw TypeErrors
instead of a refusal with a reason.

Only one failed: `layoutLandingGuard` in `stairs.mjs`, which sizes posts,
balusters and rails along the open edges of a stair landing. Given anything
but an array it threw "edges is not iterable". Given `[NaN]` it returned NaN
post counts, which would flow into a lumber order.

It now returns `{ ok: false, errors: [...] }` for an empty list, a non-array,
or any edge that is not a positive finite number, and tolerates a null rail
option. The two real callers (the deck and the stair-with-landing layout)
pass valid arrays and are unchanged; the stairs and deck suites pass (94
tests), plus a new test for the refusals.

This is hardening, not new capability: the sweep covered only `layout*`
functions with single-argument odd inputs, so other entry points are untested
by it.
