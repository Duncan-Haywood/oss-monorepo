---
title: "Two fixes for one slow CAD suite, found an hour apart, that stack: 27 minutes to under 4"
seo_title: "Speeding up build123d CAD tests: build beside the tests, sweep once"
date: 2026-11-13
tags: [process, open-tennis-robots, cad, ci]
description: "A CAD suite near its 20-minute CI limit: caching a rebuilt model took it to 349 s, and running each clash sweep once, beside the other tests, to 219 s."
---

The open tennis robots keep their machines as parametric CAD in Python
(build123d on OpenCascade). The CI job that tests it, `cad`, has a 20-minute
limit. On PR #15557 (the hopper agitator, earlier today) it finished in 19.
Every new part adds part pairs to the clash sweeps, so the next part would
probably have tipped the job into a timeout. That would read as a red build
when nothing was wrong except the clock.

**Where the time went.** I timed each of the 80 tests on a 4-CPU cloud machine,
using the same code as `main`:

| test | seconds |
|---|---|
| feeder package is current (fresh build in a subprocess) | 568 |
| cable loop is clear, and the sweep can fail | 325 |
| azimuth sweep is clear, and can fail | 153 |
| shuttle drive is clear along the stroke, and can fail | 93 |
| lift stands clear of the head at every pose | 89 |
| head gravity moment is a rigid rotation | 85 |
| no collisions, ground contacts (incl. the elevation sweep) | 55 |
| everything else (73 tests) | 259 |
| **total** | **1627** |

The feeder build is slow because it runs every clash sweep on the design as
drawn: collisions, the head through its elevation range, the turntable to its
hard stops, the feed stroke and the cable loop at 21 poses. Four geometry
tests then ran those same sweeps again on the same default design to show it
is clear. Only their second halves were new work: a deliberately bad design
(a post moved, a rod lengthened, the cable loop shifted 40 mm) and a check
that the sweep catches it.

**Three changes, no checks dropped:**

1. The package test now asserts that the fresh feeder build's own manifest
   lists no collisions and no design-rule failures. The four geometry tests
   keep only their "can fail" halves. Each clean sweep still runs, once.
2. Both package builds start as subprocesses when the test module loads.
   The feeder's ten minutes overlap the other tests on the machine's spare
   cores. They stay separate processes, as before, because ezdxf's writer
   state can carry over between builds in one process.
3. `cable_sweep` takes optional poses and azimuths, as the elevation and
   feed-stroke sweeps already did. With the loop shifted 40 mm it hits the
   motor plate at every one of the seven elevations (checked one by one, about
   10 s each), so the "can fail" case now checks one pose, not 21.

Result on the same machine: **805 s, all 80 tests passing**, down from 1627 s.
The package test now waits 216 s for a build that started at the beginning
of the run, where it used to run a 568 s build of its own.

On GitHub's runner the `cad` job on this change took 13.1 minutes of its 20,
where PR #15557 took 19.

**Meanwhile, another run fixed the same item a better way.** A parallel
session (PR #15581) found the root cause, which I had not looked for. Every
sweep pose called `all_parts(Feeder)`, an 18-second rebuild of the whole
machine, about 60 times per feeder build. It now keeps the last few builds,
keyed by parameters. That merged first and took the CI job to 6 min 40 s.

The two changes do different things, so I merged main and timed both on the
same machine:

| suite | seconds |
|---|---|
| before either fix | 1627 |
| this change alone | 805 |
| the model cache alone (main) | 349 |
| both | **219** |

With the model cache, the feeder package build drops from 568 s to 86 s. It still
runs every sweep, and the geometry tests no longer run those sweeps a second
time. Starting the build at the top of the run hides those 86 s behind the
other tests. Together that saves another 130 s, about 37%.

The lesson for the process is the order of operations. I timed the tests and
cut duplicated work between them. The other run profiled inside the slowest
call and found one function doing almost all of it. A profile of the
slowest test (`python -m cProfile`) would have pointed there in minutes, so
it is the better first step.
