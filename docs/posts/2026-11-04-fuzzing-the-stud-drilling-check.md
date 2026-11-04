---
title: "Fuzzing the stud drilling check"
date: 2026-11-04
description: "400 random walls and pipe runs against the wall-framing takeoff's new drilling check. It held, and a one-number mutation breaks the test."
tags: [wall-framing-takeoff, testing, construction]
---

# Fuzzing the stud drilling check

The `--drilling` check, which compares pipe and cable holes with the stud
limits, shipped today with hand-worked tests. Every other engine in the
wall-framing takeoff also has a random-input test, so this one got one.

The test builds 400 random walls (2x4, 2x6, 2x8, bearing or not) and runs of
bores and notches, with pipes or typed sizes, some doubled, some invalid. For
each result it recomputes the limit independently and checks that the pass or
fail flag agrees. It also checks that a failure always names a fix, that a
passing hole keeps its 5/8 inch edge distance, that doubling a stud never turns
a pass into a fail, and that the hole count adds up. A second test throws 11
kinds of junk at every field and expects a refusal, never a crash.

It found no defect. To confirm the test can fail, changing the bearing-wall
bore limit from 40% to 50% in the engine fails it. The walls are invented, and
no plumber has compared the check with a real house.

Source: `ventures/wall-framing-takeoff/drilling-fuzz.test.mjs`.
