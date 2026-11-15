---
title: "Stop Simulating Once the Answer Can't Change"
seo_title: "Early exit for an RK4 peak search using an energy bound"
date: 2026-11-15
tags: [open-tennis-robots, performance, testing, simulation]
description: "A contactor check ran 16,590 RK4 steps to find a peak that lands by step 178. An energy bound now says when to stop, with bit-identical results."
---

The open tennis-ball feeder's design checks include a contactor model. When
the main contactor closes, its contacts bounce, and each re-close is a jump
of current into the bus capacitors through the loop's resistance and
inductance. The check simulates trains of 1 to 10 bounces, each opening for
20 to 100% of the bounce window, with a fourth-order Runge-Kutta stepper.
After the last close it steps through a "settle" phase: 20 times the
circuit's slowest time constant, at a 60th of its fastest. For the default
parts that is 16,590 steps.

That phase reports one number: the highest current it reached. Its final
voltage and current are thrown away. In a traced run the peak lands at
step 178, and the other 16,400 steps confirm that the current keeps falling.

The CAD suite calls this function 1,875 times. Under a profiler it took 91
of the suite's 149 seconds.

## When is it safe to stop?

"The current has started falling" is not enough on its own. A damped
circuit can ring, and nothing about a falling current says it won't rise
again. The safe stopping point has to be one where the current provably
cannot climb back to the peak.

The circuit gives that proof cheaply. Measure the state as its distance from
where it will settle: `ev` volts and `ei` amps. The stored energy of that
distance, `C ev^2 + L ei^2`, never grows in a resistor-inductor-capacitor
loop, because resistors only take energy out. And the current's distance
from its settling value can never be larger than
`sqrt(C/L ev^2 + ei^2)`. If that bound plus the settling current is
below the peak already seen, no later step can set a new peak.

That holds for the real circuit. The stepper is an approximation, so the
code checks the stepper too. For a linear circuit one RK4 step is a fixed
2 x 2 matrix, and if that matrix's largest singular value is at most 1 (in
the energy-scaled units), the stepper can't grow the energy either. The
code checks this once per settle phase and falls back to the full run if
it fails. With the default parts it passes by 1.6e-5. A safety margin a
hundred times larger than the worst-case rounding covers the rest.

## Same bits

The steps that still run are the same code as before, so every number
computed is the same, and the peak is the same to the last bit. That was
checked directly: every one of the suite's 1,585 distinct calls, plus 600
random part choices, gave identical results from the old and new code. A
new test keeps a copy of the old integrator and compares against it.

The settle phase now stops at about step 1,200. The CAD suite went from
75.5 s to 63.4 s on a 4-core container. The bounce trains themselves are 28%
faster. The rest of their time is the steps between bounces, whose end state
feeds the next bounce and so can't be skipped.

## What the test can't see

We tried making the stop rule deliberately sloppy: stop as soon as the
current is below its peak, ignoring the voltage term. The new test still
passed. A second-order circuit starting from rest never climbs back above
its first peak, so on every case we tried the sloppy rule gave the same
bits. Only a much worse rule (stop after 64 steps, before the peak) failed it.
So this test guards against gross mistakes. It does not prove the bound. The
argument above does.

Details, the profile and what's left to try:
`docs/history/ci-perf-2026-11-15-open-tennis-settle-early-stop.md`.
