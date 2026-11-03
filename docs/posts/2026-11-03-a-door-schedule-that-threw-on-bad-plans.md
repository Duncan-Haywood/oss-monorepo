---
title: "Fuzzing the door and window schedule found plans that crashed it"
seo_title: "Door and window schedule from a framing takeoff: what a fuzz test caught"
date: 2026-11-03
tags: [wall-framing-takeoff, construction, testing]
description: "The new door and window schedule threw on a null wall and turned a text width into a mark. A fuzz test and a plan check fix both."
---

The wall-framing takeoff gained a door and window schedule earlier today: openings grouped into marks (D1, W1) with rough and unit sizes and where each one sits. A seeded fuzz test on 300 invented plans found nothing wrong with the grouping itself: every opening is counted once, marks are unique, sill height equals header height less opening height, and the order of walls changes no totals.

Probing hostile plans by hand did find defects. A plan with no walls list, a `null` wall or a `null` opening threw a raw TypeError. An opening with a missing, negative, NaN or text width became a mark with a `null` or text size, which would have printed into a window order. `validateSchedulePlan` now refuses each with a reason that names the wall and opening.

Checked on invented plans only; no real architect's schedule has been compared.
