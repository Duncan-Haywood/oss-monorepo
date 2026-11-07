---
title: "Red-teaming the insulation takeoff: a bad ceiling list crashed the validator"
date: 2026-11-07
description: "A mutation campaign and a hunt on the wall-framing insulation module found that a null or non-list attic ceiling crashed validation instead of returning an error."
tags: [red-team, wall-framing-takeoff, testing]
---

The insulation module of the wall-framing takeoff turns a floor plan into bags of batts and blown fill. Its validator is the first thing a stranger's input meets, so we attacked it.

We seeded 8 faults in `insulation.mjs` and ran its tests against each: 5 were caught, 3 escaped (62.5%). One escape showed `assembly: null` was never tested; another showed an empty wall's panel height was never pinned. The third (`ventBedrooms` of 0) cannot change behaviour, since 0 is a whole number anyway.

Reading the validator as an attacker found a real bug: `attic.ceiling` containing `null`, or being a number, threw a TypeError instead of returning "needs a list of rectangles". A web form posting such JSON would have shown a stack trace, not a message. It now returns an error, with tests for `[null]`, `5`, `"abc"` and `{}`.

The run record in `prompts/runs/` holds the mutants and the before/after catch rate.
