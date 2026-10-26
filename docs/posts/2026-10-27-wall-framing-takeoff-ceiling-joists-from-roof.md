---
title: "Drywall ceiling joints now follow the roof's own ceiling joists"
date: 2026-10-27
description: "The wall framing takeoff can place ceiling drywall end joints on the joists its roof layout already drew, instead of a spacing you type twice."
tags: [wall-framing-takeoff, construction, drywall, roof]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) already snapped ceiling drywall end joints to joists, but you had to type the joist spacing a second time, and it could disagree with the roof. Set `drywall.ceilingJoistsFromRoof: true` and the drywall reads the centres from the roof's ceiling joist layout instead.

A hand-counted test uses a 20 ft roof at 24 in: the 10 ft sheet joint at 120 in lands on a joist, while the same ceiling on a typed 16 in spacing misses. It refuses roofs with trusses or no ceiling joist size, and ceilings whose width is not the roof length. Engine and CLI only so far; not checked against a real ceiling hang. Estimates only, not engineering or building-code advice.
