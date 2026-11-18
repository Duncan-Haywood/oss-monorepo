---
title: "400 random brace jobs, and the engine held"
date: 2026-11-07
description: "A seeded property test throws 400 random and hostile wall brace jobs at the diagonal-brace counter and recounts each by hand. No bug turned up."
tags: [construction, testing, wall-framing-takeoff]
---

The wall brace counter in the framing takeoff was the one engine left without a fuzz test. It takes a list of wall lengths, a wall height, a spacing and an angle, and says how many diagonal braces to cut and how long they are.

The new test draws 400 random jobs from a fixed seed, about one in ten of them hostile (text lengths, NaN, a 201-wall list, an angle of 29 degrees). Each job must either be refused with a reason or match a separate recount: braces per wall are the wall length over the spacing, rounded up, for walls at or above the shortest braced length; each brace is the height over sin(angle); the cost is the count times the price. None threw, none printed NaN, and every recount agreed.

It found nothing to fix, so it only pins the behaviour. Inputs are invented; which walls are braced wall lines, and the bracing method, stay the engineer's call. The test is `ventures/wall-framing-takeoff/braces-fuzz.test.mjs`.
