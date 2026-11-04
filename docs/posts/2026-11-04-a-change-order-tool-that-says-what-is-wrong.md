---
title: "A change-order tool that says what is wrong"
date: 2026-11-04
description: "Two wall-framing takeoff tools crashed with raw errors on a bad budget or window list. They now name the problem."
tags: [wall-framing-takeoff, construction, testing]
---

# A change-order tool that says what is wrong

The change-order comparison and the ganged-window option in the wall-framing
takeoff both assumed their input was well formed. Probing them by hand showed
otherwise: an empty budget produced "Cannot read properties of undefined", and
a window offset typed as text ("10") was merged on coercion, while NaN was
silently saved as `null`.

Both now check their input first and refuse with a plain reason, such as
"revised budget line 3 (2x4) has a quantity that is not a number" or "wall A1:
opening 2 needs a numeric offset and width". Good plans behave exactly as
before. The tests are in `hostile-gang-compare.test.mjs`; the compare, ganged,
CLI and page suites all pass. Everything was checked on invented inputs, not a
real builder's budget.
