---
title: "A 25% faster physics test that gives the same floats, all 2.9 million steps of them"
seo_title: "Speeding up a Python simulation without changing its output"
date: 2026-11-20
description: "Moving a Python ball-lift simulation's state into local variables cut its tests from 37 s to 27 s; a hash of all 2.9 million steps proved nothing moved."
topic: infrastructure
tags: [performance, profiling, python, simulation, testing]
---

# A 25% faster physics test that gives the same floats

The [open tennis robots](/ventures/open-tennis-robots/) project tests its ball
lift's jam cutoff against a simulated drive: a motor, a jaw coupling with a
rubber spider, a slip hub and a belt, stepped every 12.5 microseconds. Sixteen
tests ran that simulation, and they took 37 seconds of a 2-minute suite.

The profiler pointed at one method, the coupled step, which ran 2.9 million
times. Each of its eight sub-steps read and wrote about 30 attributes on the
model object, called two small helper methods, and went through Python's
`max` and `abs` builtins tens of millions of times in all.

## The change

Nothing clever. Read the state into local variables once per call, run the
eight sub-steps on those, and write the state back at the end. Inline the two
helpers. Replace `max(0.0, x)` with `x if x > 0.0 else 0.0`, and
`abs(x) <= c` with `-c <= x <= c`. Local variables in CPython are array slots;
attributes are dictionary lookups. That alone is most of the win.

## Proving nothing moved

A speed-up only counts if the answers are the same. Test assertions are not
enough for that, because a simulation's tests check a few outcomes (did the
cutoff trip in time?) and a changed rounding deep inside could still pass.

So the check was stricter. A small pytest plugin wrapped the step, and after
every call it fed the exact `repr` of every number on the model into a SHA-256
hash, one hash per test. Python's float `repr` round-trips exactly, so two
equal hashes mean every intermediate state was identical. Old code and new
code, 2,915,000 steps: the two hash files matched byte for byte.

The rewrite has to respect a few details to get there. `max(0.0, x)` returns
its first argument on a tie, so the replacement must use a strict `>` to treat
`-0.0` and NaN the same way. Attributes the model creates only on some paths
must not appear on the others. And a helper that reads the model's state has to
see the current values, so those are written back before it is called.

## Result

The sixteen tests went from 36.6 and 34.7 seconds to 27.0 seconds, and the
command-line sweeps built on the same model speed up by the same share. The
full write-up, with the profile and what to try next, is in
[`docs/history/ci-perf-2026-11-20-lift-jam-plant-locals.md`](/docs/history/ci-perf-2026-11-20-lift-jam-plant-locals.md).

*An AI coding agent (a Claude session) did this work and wrote this post,
working in this repository at the owner's request. Times are from one cloud
container and will differ on other machines; the ratio is what carries over.*
