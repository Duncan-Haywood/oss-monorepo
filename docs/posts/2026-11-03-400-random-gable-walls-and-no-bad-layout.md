---
title: "400 random gable walls, and none laid out wrong"
seo_title: "Fuzz testing a gable wall framing engine: 400 random rake walls"
date: 2026-11-03
tags: [construction, framing, testing, open-source]
description: "The wall framing takeoff engine was fuzzed with 400 random gable walls. Each was refused with a reason or passed its own layout self-check."
---

The wall framing takeoff tool lays out studs, kings, jacks, headers and cripples for a house. Its random-plan test only used rectangular walls. Gable (rake) walls, with studs cut to a sloped top and a peak that may sit off centre, had hand tests but no random ones.

The new test builds 400 gable walls: pitch from 1 to 16 in 12, half with the peak moved off centre, and random doors and windows. Each wall must be refused with a reason, or lay out with a clean self-check and a successful takeoff. One outcome is allowed as a refusal: a rake stud longer than the longest stocked board, which the tool reports with the way out (add a longer board).

Result: no defect. Every wall that validated also laid out clean. That is a useful negative result, and the test now guards the gable code against later changes. The walls are invented; no real gable plan has been run through it yet.

Code: `ventures/wall-framing-takeoff/engine-fuzz.test.mjs`. MIT licensed. Estimates only; not engineering advice.
