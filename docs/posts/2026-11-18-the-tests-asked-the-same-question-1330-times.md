---
title: "The tennis robot's tests asked the same circuit question 1,330 times"
seo_title: "Caching a simulation by the inputs it reads, not the object"
date: 2026-11-18
tags: [open-tennis-robots, performance, testing, ci]
description: "70% of a CAD suite's contactor simulations repeated earlier ones exactly. A cache keyed on the numbers they read cut it from 74 s to 47 s."
---

The open tennis-ball feeder's CAD package carries a set of design rules: a
power-up check that the main contactor's bounce cannot slam more current
through the bus capacitors than the contacts are rated for, among a few dozen
others. Each rule is a small simulation. The test suite proves the rules
catch mistakes by building dozens of deliberately broken designs, one wrong
field at a time, and checking that the right rule complains.

That suite took 74 s in a development container, and about two minutes a
job on CI. Half of it went to one function, the contactor bounce train: an
RK4 integration of the bus's RLC loop through up to ten opens and re-closes.

## Same object, same question?

A run three days ago looked at caching it and gave up on the idea: 1,585 of
the 1,875 designs it was called on were different objects, so a cache keyed
on the design would hit at most 15% of the time.

The trick is that a broken design is usually broken somewhere else. A design
with the wrong hose length or a too-short sleeve is a different object, but
its contactor loop is exactly the same. So this run counted the calls by the
ten numbers the simulation actually reads: the loop's resistance, inductance
and capacitance, pack voltage, precharge resistor and its leftover gap, the
bounce window, the load, and the bounce count and shape.

**569 distinct questions in 1,899 calls.** 1,330 were repeats.

## The change

The simulation is now cached on those ten numbers (by their exact bit
patterns), and every caller gets its own copy of the answer so no one can
edit someone else's result. A second, smaller win: the function that asks for
24 bounce trains at a time was recomputing the loop's R, L and C for each
one; it now does that once.

Nothing about the integrator changed. The 39 full bounce studies the suite
runs came out identical, to the last bit, against the old code, and a new
test pins cached answers against the reference integrator.

Suite time: **74 s to 47 s**.

The general lesson is an old one, but easy to miss: when a cache keyed on
the whole object looks pointless, count the inputs the expensive part
actually reads. The record of the measurement is in
[the perf note](../history/ci-perf-2026-11-18-open-tennis-bounce-train-cache.md).
