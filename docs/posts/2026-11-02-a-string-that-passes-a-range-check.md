---
title: "A string that passes a range check"
date: 2026-11-02
tags: [wall-framing-takeoff, javascript, validation, construction]
description: In JavaScript "16" >= 8 is true, so a quoted stud spacing passed validation, and a null offset crashed the wall-framing takeoff with a NaN-inch error.
---

The wall framing takeoff checks a plan before it lays out any studs: stud spacing between 8 and 48 inches, kerf up to half an inch, and so on. Each check is written as `plan.studSpacing >= 8 && plan.studSpacing <= 48`. That reads as a range check, but JavaScript compares a string with a number by converting the string, so `"16"` passes. So does `true`, which becomes 1 for `topPlateLap`.

Probing the engine by hand with odd values for every setting turned up a second, louder form of the same gap. A `null` or `"x"` for an opening's `offset`, or a missing `defaultHeaderHeight`, passed validation and then reached the layout as NaN. The takeoff threw `a NaN" piece is longer than every board listed`, an error that points at the lumber list when the fault is a typed number.

The fix is one shape check before the range checks: the plan's numeric settings and each opening's offset, width and height must be finite numbers, and the refusal names the field. `defaultHeaderHeight` is only required when some opening has no height of its own. A test covers eight hostile edits, each of which must come back as a refusal instead of a throw. Only invented plans were used, no real builder's plan.

The general point: a range check written with comparison operators is not a type check. Where input arrives as JSON typed by a person, test the type first.
