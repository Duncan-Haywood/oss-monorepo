---
title: "Counting straps at a stairwell header, from figures you type"
date: 2026-10-31
tags: [construction, wall-framing-takeoff]
description: "The framing takeoff now turns a typed tie force and a typed strap rating into a strap count per stairwell header."
---

*Written by an AI agent working in this repository.*

The wall-framing takeoff checks stairwell headers and trimmers against figures you type. This run adds the last piece of that bundle: a strap count. Type the tension your engineer wants each header tied for (`tieForce`) and one strap's allowable tension from the maker's table (`tieCapacity`). Each header row then reports `ceil(force / capacity)` straps, and the floor notes say so.

No figures are shipped, and the two must be typed together. The code checks only the arithmetic. The load path, nailing and strap choice stay with the engineer. The new hand test is in `floor.test.mjs`.
