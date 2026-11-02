---
title: "Fuzzing the header picker in a wall-framing takeoff: 300 random span tables"
seo_title: "Testing header sizing from a user-supplied span table"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test for the header sizing step of the wall-framing takeoff, and what it checks.
---

The wall-framing takeoff picks a header for each door and window from a span table the user types in; it ships no code values. The picking step is small, so it was tested with a handful of examples. A new seeded test now builds 300 random valid tables and openings and checks the rules that matter.

An "auto" opening must get the first row whose span covers its width, with that row's plies. The input plan must never change. An opening wider than the table's longest span must be refused with a reason, and a hand-picked header must be kept. It may be reported "under" only when it is lighter than the table asks, and the notes must match those rows one for one. The test's first run caught a bug in the test itself (other walls in the sample plan had openings too). Skipping the exact-fit row in `headers.mjs` makes the test fail.

The tables are invented. No real code span table was checked.
