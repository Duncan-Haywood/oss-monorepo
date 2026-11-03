---
title: "How much cash does a builder float between spend and draw?"
date: 2026-11-01
tags: [wall-framing-takeoff, scheduling, construction]
description: The schedule tool now turns typed draw terms, a payment lag and retainage, into the deepest gap between cash paid out and cash received.
---

A job's total cost is not the number that sinks a small builder. The gap is: crews and suppliers are paid as the work happens, while the lender or owner pays a draw weeks later and holds back retainage until the end.

The framing takeoff's schedule already spread each activity's typed cost over its working days. It now takes `draw: {lagDays, retainagePct, releaseLagDays}` (page field "Draw terms", for example `14, 10, 30`) and reports the peak cash you float, the date, and when retainage comes back.

Hand check, as in the test: $2,000 spent over Monday and Tuesday, paid 7 days late with 10% retainage, leaves the builder $2,000 out of pocket on Tuesday. The $200 retainage is released 7 days after the last working day.

Terms are yours; no lender's rules are assumed, and no real builder's draw schedule has been run through it yet.
