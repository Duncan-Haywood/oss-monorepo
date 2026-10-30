---
title: "Siding takeoff now counts the triangle on a gable end"
date: 2026-10-29
tags: [wall-framing-takeoff, construction]
description: "The free wall-framing takeoff's siding count used to treat a gable end as a rectangle. It now lays courses up the triangle and wraps its true area."
---

The free wall-framing takeoff counts lap siding course by course, with openings cut out and offcuts reused. Until now a gable end was treated as a plain rectangle at eave height, so the triangle above was missing from the boards and the house wrap.

A wall with a `gable` pitch (and optional off-centre peak) now gets its triangle. Each course above the eave line is as long as the triangle is wide at that course's lower edge, which is how boards are cut to the slope, and the wrap uses the exact triangle area. The tests check hand arithmetic for a centred 6:12 gable and an off-centre 12:12 peak. It has not been compared with a real siding order, and there is no rake trim yet.
