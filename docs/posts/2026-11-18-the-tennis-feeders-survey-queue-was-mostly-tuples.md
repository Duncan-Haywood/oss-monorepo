---
title: "The tennis feeder's survey queue was mostly tuples"
date: 2026-11-18
tags: [open-tennis-robots, firmware, micropython, esp32]
description: "Packing a queued survey's tick logs into arrays cut it from 12.8 KB to 4.0 KB of ESP32 heap, so the feeder board now queues three surveys, not two."
---

The open tennis-ball feeder's ESP32 checks, after each ball, how well the
launcher wheels' lag fits a grid of ESC lags. That check is a survey, and a
wheel's survey takes about two seconds of spare control ticks. In a rally drill
balls come faster than that, so surveys wait in a queue. The queue was two deep,
"kept small for the ESP32's heap". Nobody had counted the heap. The flagship's
to-do list asked whether three would fit
([firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md),
"A queued survey's heap").

## Counting without a board

There was no board to run `gc.mem_free()` on, so `tests/survey_heap.py` counts
instead. It wraps the board's own queue in the simulator and sizes everything
each waiting survey keeps alive. The sizes follow MicroPython 1.24's ESP32 port,
read from its source:

- the heap is handed out in 16-byte blocks;
- a small integer lives inside the pointer and costs nothing extra;
- a float is boxed and takes a whole block;
- a tuple of n items is 2 + n four-byte words;
- a list is a header plus an items array that doubles as it grows.

## Where the bytes were

A survey keeps its ball's period snapshots and tick logs. The snapshots are about
half a kilobyte. The tick logs are the rest. Every control tick appends
`(edge count, microseconds since that edge, command)`, and the command is a
float. That is two blocks for the tuple and one for the float, about 48 bytes a
tick. A waiting survey held 11.1 to 12.8 KB. Two of them pinned 25.6 KB, almost
half of the 56 KB heap the ESP32 port starts with.

The fix was small. `PackedTicks` stores a log as three arrays: two of 32-bit
integers and one of single floats, the board's own float size. That is 12 bytes
a tick, and it reads back as the same tuples. So every fit sees exactly what it
saw before.

## The rule, written first

Before the first run, the script said what it expected (10 to 25 KB a survey
with tuples, under 8 KB packed) and when depth 3 would ship:

1. at depth 3, packed surveys pin no more heap than depth 2 with tuples did;
2. packing changes nothing (wheels surveyed, the pick, every launch record);
3. depth 3 surveys at least as many wheels.

It ran on nine drills: rally, example and calibration, each on three simulated
builds (a plain wheel, a 50 ms ESC and a jittery tach).

| form, depth | KB a queued survey | peak pinned KB |
| --- | --- | --- |
| tuples, 2 (as shipped) | 11.1-12.8 | 25.6 |
| packed, 2 | 3.4-4.0 | 8.0 |
| packed, 3 (ships) | 3.4-4.0 | 12.0 |

All three held on all nine drills. Depth 3 surveyed two more wheels on every
one. On the ESC build's calibration drill that is all 24, where depth 2 got 22.
So the board now queues three surveys and needs less than half the survey heap
it did.

One mistake was caught on the way. The first run's "ESC" build only told the
board there was a 50 ms lag, and the simulated wheel had none. It picked 0 ms,
which gave it away. The rerun put the ESC in the plant and picked 46 to 47 ms.

## What this doesn't show

These are counts against a model of MicroPython's layout, not a reading from a
board. What is free with `main.py` loaded is still unknown. The live tick log of
the stroke under way is still tuples, about 23 KB for both wheels. Packing it
would put an array append in the control loop, and that is worth doing only if a
real WROOM-32's `gc.mem_free()` after a rally drill shows the heap is tight.
