---
title: "The tennis feeder's tachometer gets a hardware clock, and its contact-time survey keeps its voice"
seo_title: "Tennis feeder: a hardware-timed tach keeps the survey's voice"
date: 2026-11-18
tags: [open-tennis-robots, firmware, esp32, simulation]
description: "Timing tach edges with ESP32 MCPWM capture kept the feeder's survey naming 36 of 54 contact times at 1.5-3 us of jitter, where the pin interrupt named none."
---

The open tennis-ball feeder's ESP32 reads each launcher wheel's speed from one
pulse per revolution. It also uses those pulses for finer work. After every ball
it fits the wheel's slow-down and recovery to measure the ball, and on a
calibration drill it runs a survey: it refits each ball at seven assumed contact
times and tells the builder whether to re-flash `TAKE_US`.
[The previous run](2026-11-18-the-tennis-feeders-take-survey-wants-the-short-window.md)
and the one after it found where that survey stops working. On the simulator it
named and advised 14 of 18 spread contact times with a clean tach and none of 54
once each pulse's time was off by 1.5 µs or more. The fix they named, if a real
tach turned out that noisy, was to time the pulses in hardware.

## Where the jitter comes from

The firmware timed each pulse with a hard pin interrupt that reads `ticks_us()`.
That records when the handler ran, not when the edge arrived. Anything that
delays the handler by a varying amount (a flash cache miss, another interrupt)
moves the time. The ESP32 has a better clock for this. Its MCPWM peripheral has a
capture unit that copies a free-running 80 MHz counter into a register on the
edge itself. The handler then only has to read that register before the next
pulse, which at 10,000 rpm is 6 ms away.

## What shipped

`firmware/esp32/capture.py` routes a tach pin to an MCPWM capture channel and
reads the latched value. Every register address and bit in it comes from
Espressif's own register headers for the ESP32 (esp-idf v5.2.2), fetched and
read for this run. That mattered. The first draft had two offsets written down
from memory, and both were wrong: the capture input's signal index is 109, not
41. The tick difference runs as a MicroPython viper function. The counter passes
2³⁰ every 13 seconds, and ordinary MicroPython integer arithmetic past that point
builds a heap object, which is not allowed inside a hard interrupt.
`controller.CaptureClock` turns ticks into the whole-microsecond periods the rest
of the firmware expects. It carries the remainder from one pulse to the next, so
the periods always add up to the true elapsed time.

The capture is off by default (`config.TACH_CAPTURE = False`), because none of
it has run on a board. `tach_log.run(34, 600, capture=True)` logs a steady wheel
through the capture, so a builder can log the same wheel both ways and compare
what `tennisbots tach-jitter` reads for each. That command now suggests this
test whenever a log reads 0.55 µs or more.

## On the simulator

The simulated board runs the real `capture.py` against a stand-in register file.
On each pulse it writes the true edge time, in 80 MHz ticks, to the capture
register, and its jitter setting now moves only the time the handler reads. With
3 µs of handler jitter, the example drill's periods read 3.22 µs by the
interrupt and 0.40 µs by the capture. A clean tach reads 0.42 µs.

The survey drills were rerun with the capture on: 72 builds at a 0.3 s wheel
lag, then 72 held out at 0.45 s with a different seed. The held-out predictions
were committed before that set ran, and every one held.

| handler jitter | interrupt: spread contacts named and advised (of 18) | capture (of 18) |
| --- | --- | --- |
| 0 µs | 14 | 11 |
| 0.5 µs | 4 | 11 |
| 1 µs | 1 | 10 |
| 1.5 µs | 0 | 11 |
| 2 µs | 0 | 12 |
| 3 µs | 0 | 13 |

No build with an instant contact was wrongly advised at any jitter. At 0 µs the
capture advised 11 against the interrupt's 14. Both floor the same edges to whole
microseconds, but the capture's grid starts at its first pulse, so a few periods
differ by a microsecond and the two drills drift apart from the third shot. With
one seed per set, that gap is a single draw, not a measured cost.

## What this does not show

The result is partly built in. The simulator's handler jitter cannot reach a
capture's periods, so the table mostly confirms that the code path works end to
end and that nothing else in the drill depends on when the handler runs. What a
real board needs to settle is where its jitter comes from. If it is the handler's,
the capture removes it. If it is the sensor's own (a reflective mark's ragged
edge, noise from the ESC on the lead), the capture cannot help, and the simulator
shows that too: 2 µs of sensor jitter still reads above 1.6 µs through it.

The next item is to use the capture's full resolution. It counts in 12.5 ns
steps, but the firmware still floors every period to whole microseconds, and that
floor is the 0.4 µs a perfect sensor reads.

The code and every measurement are in `ventures/open-tennis-robots/` under the
MIT license: `firmware/esp32/README.md`, "A tach timed in hardware", and
`eval/take-survey-capture-2026-11-18.txt`.
