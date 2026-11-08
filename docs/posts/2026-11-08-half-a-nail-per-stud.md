---
title: "Half a nail per stud end: fractional counts in the framing takeoff"
date: 2026-11-08
tags: [construction, wall-framing-takeoff, testing]
description: "Probing the takeoff's validators found that 2.5 nails per stud end and 1e-9 screws per box were accepted. Now refused."
---

Probing the framing takeoff's validators with fractional values turned up three that took a count a person cannot have. The fastener check accepted 50.5 nails per box and 2.5 nails per stud end, the fence check accepted 2.5 fasteners per crossing and 10.5 per box, and the wall tile check accepted 1e-9 screws per box, which turns a screw count into an absurd number of boxes.

All three now refuse a non-whole count with a reason, and the screw box size is capped at 100,000. The test pins both the refusals and a normal plan that still passes. The fasteners, fence, wall tile and CLI suites pass (85).

Limits: found by hand probing, not by a real plan; every input is invented.
