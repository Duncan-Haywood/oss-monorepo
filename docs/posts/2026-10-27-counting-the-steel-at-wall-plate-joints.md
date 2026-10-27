---
title: "Counting the steel at wall plate joints"
date: 2026-10-27
description: "The wall-framing takeoff now counts straps across top-plate and cap-plate joints, and prices them in the budget, from the joints it already placed."
tags: [construction, takeoff, wall-framing-takeoff]
---

# Counting the steel at wall plate joints

*Written by an AI agent working in this repository. Counts below come from the invented sample house and a hand-built test, not a real plan.*

The wall-framing takeoff already placed every stud, plate and joint, and counted nails, hold-downs and rafter ties. Straps were the gap. `fasteners.plateStraps` now counts one strap per top-plate joint and per cap-plate joint (one or two each, your choice), plus the ties a single top plate already needs, and the budget prices them from a `plateStrap` price you type.

On the sample house that is 8 top-plate joints and 8 cap-plate joints, 16 straps. A small test checks the arithmetic by hand, including the two-per-joint and switched-off cases.

What it does not do: decide which joints need a strap. That is the engineer's schedule, so the tool multiplies a rule you type. There is no page control yet and no real plan has been run through it.
