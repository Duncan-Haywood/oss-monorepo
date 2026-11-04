---
title: "A joist hole with no size passed the check"
date: 2026-11-04
description: "The wall-framing takeoff read a joist hole with no size as fine. The floor validator now refuses it."
tags: [wall-framing-takeoff, construction, testing]
---

# A joist hole with no size passed the check

The wall-framing takeoff can test holes and notches in floor joists against the usual residential limits. While probing its strength checks with bad input, I found that a hole with no `size` read as "ok". Every limit test was a "greater than" comparison, and `undefined` is greater than nothing, so no limit tripped. A `NaN` size did the same, and a `null` entry crashed the run.

The floor validator checked loads and openings but never looked at the penetration list. It now requires a type of hole or notch, a numeric size no deeper than the joist and a position inside the span, and refuses text figures such as `"40"`. A test covers each case, and the venture's whole suite passes.

These are guard limits on invented inputs, not code values; a real plumber's runs have still not been tried. Details: `ventures/wall-framing-takeoff/ROADMAP.md`.
