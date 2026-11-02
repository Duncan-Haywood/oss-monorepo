---
title: "Four hundred random roofs against the gutter count"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test throws random gable and hip roofs and gutter settings at the gutter engine and checks sections, downspouts, hangers and caps.
---

The gutter count in wall-framing-takeoff packs each eave run into stock sections, then adds downspouts by run length and roof area, hangers, end caps, elbows and straps. A new seeded fuzz test builds 400 random gable and hip roofs with random overhangs and pitches, picks random stock lengths, hanger spacing, downspout rules, waste and prices, and checks the result.

Every count must be finite and non-negative. The sections must be able to hold the runs, every run needs a downspout and two caps, the hangers must cover the spacing, the downspout pieces must reach the eave height, a hip takes four outside corners and a gable none, and a plan with no prices has no cost. More waste never gives fewer sections and a tighter area rule never gives fewer downspouts. All hold. It found no bug. To check the test can fail, we made the engine count one cap per run and it failed at once. Roofs the roof engine refuses (a hip rafter longer than any listed board) are skipped. It is still not compared with a real gutter order.
