---
title: "Four hundred random roofs against the soffit and gutter count"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test throws random gable and hip roofs at the soffit, fascia and gutter engines and checks stock, caps, hangers and downspouts.
---

The soffit, fascia and gutter counts in wall-framing-takeoff run along the roof's eaves, pack each run into stock lengths, and add caps, hangers, elbows and downspouts. Hand tests cover the cases we picked. A new seeded fuzz test covers the rest: 400 random gable and hip roofs with overhangs from 0 to 24 inches and random panel widths, stock lengths, waste, hanger spacing and downspout rules.

Each result must be refused with a reason or hold these: every count finite and non-negative, fascia and gutter stock that can hold the runs, soffit courses that reach the overhang, no rake on a hip, two end caps per run, outside corners only on a hip, at least one downspout and hanger per run, and never fewer pieces when waste goes up. All hold, and it found no bug. To check the test can fail, we made the end-cap count one per run instead of two, and it failed. It is still not compared with a real gutter or soffit order.
