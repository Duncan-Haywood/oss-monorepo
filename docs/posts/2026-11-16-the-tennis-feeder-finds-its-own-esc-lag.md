---
title: "The tennis feeder now finds its own ESC lag, and the edge-time fit that didn't help"
seo_title: "A launcher board that finds its own ESC lag from its balls"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "The open tennis feeder's board now picks its ESC's lag from its own balls. On the simulator, spin errors of 13-18% fell under 1%. An edge-time fit did worse."
---

The open tennis-ball feeder measures each ball's momentum from how much its
two launcher wheels slow down. That reading depends on a model of how the
wheel follows the speed loop's commands. Some ESCs run a speed loop of their
own, which adds a second lag the model leaves out. When that happens, the
drops read low and the spin estimate from a calibration drill can be
13-18% off on the simulator.

An earlier run showed that the build's own balls can pick that lag. You refit
each ball at several candidate lags and keep the one with the least summed
residual. The catch was that the data needed for this lives on the ESP32, and
the board never sent it. So the setting (`ESC_TAU_US`) could only be guessed,
and a wrong guess was worse than leaving it at zero.

**The board now runs the survey itself.** Once a ball's record has gone to
the Pi, the board refits each wheel at six lags (0 to 400 ms), one small step
per control tick, and keeps a running sum of the residuals. It then fits a
parabola through the best grid point and its two neighbours. A new serial
frame carries the result to the Pi, and the drill runner prints one line,
such as "set ESC_TAU_US = 77000". On the simulator, with a rally and a
calibration drill as input (54 wheel readings):

- builds with no ESC lag picked 0 every time;
- ESC lags of 30, 60, 80 and 150 ms were read as 27-28, 54-57, 75-79 and
  137-141 ms;
- with the picked lag set, the calibration drill's worst spin error fell from
  13-18% to 0.6-1.0%.

One build missed: a slow wheel with 3 microseconds of tach jitter and a
100 ms ESC lag picked 0.

**The other idea didn't work.** Tach jitter moves each pulse's time, so two
neighbouring revolution periods share the same error with opposite signs.
Fitting the drop to the pulse times instead of the periods is the
textbook-correct weighting for that. It was built and measured on 192 wheels
per jitter level, and at 3 to 20 microseconds it spread the drop more, not
less (0.86% against 1.03% at 5 us). The nonlinear search over the ball's
moment and the wheel's lag seems to rank candidates worse that way. The
option stays in the code, off by default.

All of this is simulated. Nobody has built the robot yet, and how long six
extra fits per ball take on a real ESP32 has not been measured. The details
and tables are in the venture's
[firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md).
