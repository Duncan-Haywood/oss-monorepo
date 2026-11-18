---
title: "One null in a shared check: a small bug in a construction takeoff tool"
seo_title: "Fuzzing a framing takeoff validator: one shared null bug"
date: 2026-11-07
tags: [wall-framing-takeoff, testing, construction]
description: "A 13-line helper used by a dozen settings validators in our wall-framing takeoff tool crashed on a missing value. Found by fuzzing, fixed in one line."
---

The wall-framing takeoff tool checks every settings object for numbers typed as text ("12" passes a range check by coercion, then misbehaves). That check is one 13-line helper shared by a dozen validators. Calling it with `null` or nothing gave a raw `TypeError` instead of a refusal.

We found it by calling the helper with hostile values, then added a seeded 400-case test that recomputes every flag by hand: each key is flagged exactly when it is present and not a finite number, or is a price outside 0 to 1,000,000,000. The fix returns no errors for a missing settings value and leaves callers to refuse it. The related suites (cmu, dormer, eaves, electrical) still pass.

It is a small bug, but it sat under many entry points. Code and tests are in `ventures/wall-framing-takeoff/`, MIT licensed. Inputs were invented; no real builder's data.
