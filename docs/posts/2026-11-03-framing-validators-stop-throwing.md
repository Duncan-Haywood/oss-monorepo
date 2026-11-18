---
title: "Three framing validators that threw on bad input now answer with an error"
seo_title: "Framing takeoff floor, roof and stair validators fixed"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, testing]
description: "validateFloor, validateRoof and validateStair threw a TypeError on null or a string; they now return an error list like the other validators."
---

A shape test in `ventures/wall-framing-takeoff/validators-shape.test.mjs` already checked that nine settings validators answer `null`, a number, a string or an array with an error list instead of throwing. Eight validators were not in it. Probing them found three that threw: `validateFloor` and `validateRoof` (`Cannot read properties of null`) and `validateStair`.

Each now returns a one-line error ("Floor settings are an object.") for input that is not a plain object, and all three are in the shape test. The floor, roof, stair and hostile-input suites pass (140 tests). The other five (engine, foundation, headers, opening schedule, ventilation) already answered correctly. This only affects a caller that passes a malformed settings value; the numbers for valid input are unchanged.
