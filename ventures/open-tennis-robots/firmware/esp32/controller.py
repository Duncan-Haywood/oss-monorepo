"""Board-independent firmware logic: command dispatch, watchdog, e-stop, telemetry.

Runs on MicroPython (imported by main.py) and on CPython (tests drive it
with a fake hardware object), so it touches hardware only through `hw`.

`hw` must provide:
    stop_all()                       cut every motor (launcher wheels coast down)
    set_launch_rpm(top, bottom)      feeder only
    set_aim(elev_cdeg, az_cdeg)      feeder only
    feed(n)                          feeder only: release n balls
    set_base(target_y_mm, max_mm_s)  feeder only: lateral base move
    drive(left_mm_s, right_mm_s)     collector only
    pickup(on)                       collector only
    estop_pressed() -> bool          physical e-stop input
    bumper() -> bool                 collector bumper switches (False on feeder)
    flags() -> int                   extra TELEMETRY flag bits (hopper, battery)
    base_y_mm() -> int
    rpm() -> (top, bottom)
    battery_mv() -> int
    balls_fed() -> int               feeder only: balls released through the gate since power-up (sent mod 256)

and may provide:
    lift_hub_reset()                 feeder: RESET_LIFT_HUB arrived with its key: the slip hub was re-set on the bench
    bus_tick(now_ms) -> bool         feeder: read the contactor's coil sense; True on the tick the switched bus is lost
                                     (an e-stop the board did not see, such as the wireless fob): the controller halts
"""

import json
import math
from array import array
import os
import sys

import protocol as P

WATCHDOG_MS = 300        # stop if the Pi goes quiet for this long
TELEMETRY_MS = 100

ROLE_FEEDER = "feeder"
ROLE_COLLECTOR = "collector"

FEEDER_CMDS = (P.SET_WHEELS, P.SET_AIM, P.FEED, P.SET_BASE, P.RESET_LIFT_HUB, P.SURVEY_TAKE)
COLLECTOR_CMDS = (P.DRIVE, P.PICKUP)

MAX_RPM = 7000
MAX_DRIVE_MM_S = 1200
MAX_BASE_MM_S = 3000
BASE_HALF_TRAVEL_MM = 4000   # hardware/feeder-catcher.md: lateral travel +/- 4.0 m from the centre mark


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def trimmed_mean(vals, trim=None):
    """Mean of `vals` without the `trim` highest and lowest (default a quarter each side), 2026-11-14: one pot reading
    caught on a PWM edge (cad/README.md "The pot's pickup from the motor pair") or the ADC's own noise does not move
    the position, while a wire really off still reads off on every sample."""
    s = sorted(vals)
    k = len(s) // 4 if trim is None else trim
    if len(s) - 2 * k < 1:
        raise ValueError("nothing left after trimming")
    mid = s[k:len(s) - k]
    return sum(mid) / len(mid)


class StepperAxis:
    """Open-loop step/dir axis with trapezoidal moves and a home switch (the feeder's azimuth stepper, 2026-11-10).

    Board-independent: `update(dt_ms, home_closed)` returns the signed number of step pulses to send now, and the
    board layer pulses them. Positions are in degrees at the output (the turntable); `steps_per_deg` folds in the
    motor's steps, microstepping and the gear ratio. Until the home switch has been found the axis is unhomed and
    targets are remembered but not driven. A stop from above `safe_stop_deg_s` may lose steps, so it clears the home
    and the axis homes again.

    The switch is held closed by a cam at every angle at or below `home_deg` (cad: Feeder.home_switch_design, added
    2026-11-12), so it says which side of home the axis is on. Homing (all at `home_deg_s`): if the switch is closed
    when the search starts, back off toward positive angles until it opens, then `backoff_deg` more; then creep
    negative and take the home on the switch closing. The home is always taken on the same edge in the same
    direction. Until 2026-11-12 a closed switch was taken as home at once, so a head left past home (turned by hand,
    or coasting after a power cut) homed up to 5.5 deg off, and a switch wire shorted to ground homed anywhere.
    Faults stop the axis: backing off more than `off_cam_deg` with the switch still closed (a stuck or shorted
    switch; since 2026-11-12 the hard stops at +-35 deg keep a head from turning past the gear sector's end, cad/README.md
    "Azimuth hard stops"), or creeping more than `search_deg` without finding it (a broken switch must not drive the
    head into its end stop forever: at `home_deg_s` the stepper only stalls against the stop's pad).
    """

    def __init__(self, steps_per_deg, vmax_deg_s, accel_deg_s2, home_deg, lo_deg, hi_deg,
                 home_deg_s=5.0, safe_stop_deg_s=10.0, backoff_deg=2.0, off_cam_deg=12.0, search_deg=None):
        self.k = steps_per_deg
        self.vmax, self.accel = vmax_deg_s, accel_deg_s2
        self.home_deg, self.lo, self.hi = home_deg, lo_deg, hi_deg
        self.home_v, self.safe_v = home_deg_s, safe_stop_deg_s
        self.homed = False
        self.fault = False
        self.pos = 0.0            # degrees, valid once homed
        self.v = 0.0              # degrees per second, signed
        self.goal = 0.0
        self._sent = 0            # steps sent, in the same frame as round(pos x steps_per_deg)
        self._searched = 0.0
        self._phase = None        # homing: None (not started), "off" (leaving the cam), "clear", "seek"
        self._backed = self._cleared = 0.0
        self.backoff, self.off_cam = backoff_deg, off_cam_deg
        # the furthest a seek can need: from the top of the range plus the gear sector's spare teeth, down to home
        self.search = search_deg if search_deg is not None else (hi_deg - home_deg) + 20.0

    @property
    def steps(self):
        return round(self.pos * self.k)

    def target(self, deg):
        self.goal = _clamp(deg, self.lo, self.hi)

    @property
    def settled(self):
        return self.homed and not self.fault and self.v == 0 and abs(self.goal - self.pos) < 0.5 / self.k

    def stop(self):
        if abs(self.v) > self.safe_v:
            self.homed = False
            self._phase = None
        self.v = 0.0
        if self.homed:
            self.goal = self.pos

    def unpowered(self):
        """The driver lost power or its ENABLE (2026-11-14): an unpowered stepper holds nothing, so the position is
        gone and the axis homes again once it is back."""
        self.homed = False
        self._phase = None
        self.v = 0.0

    def _emit(self):
        n = round(self.pos * self.k) - self._sent
        self._sent += n
        return n

    def _home(self, dt, closed):
        if self._phase is None:
            self._phase, self._backed, self._searched = ("off" if closed else "seek"), 0.0, 0.0
        if self._phase == "seek":
            if closed:
                self.homed, self.pos, self.v, self._phase = True, self.home_deg, 0.0, None
                self._sent = round(self.pos * self.k)
                return 0
            self._searched += self.home_v * dt
            if self._searched > self.search:
                self.fault, self.v = True, 0.0
                return 0
            self.v = -self.home_v
            self.pos -= self.home_v * dt
            return self._emit()
        if self._phase == "off" and not closed:
            self._phase, self._cleared = "clear", self._backed
        elif self._phase == "clear" and closed:
            self._phase = "off"                    # a bounce: still on the cam
        if self._phase == "off" and self._backed > self.off_cam:
            self.fault, self.v = True, 0.0
            return 0
        if self._phase == "clear" and self._backed - self._cleared >= self.backoff:
            self._phase, self.v = "seek", 0.0
            return 0
        self._backed += self.home_v * dt
        self.v = self.home_v
        self.pos += self.home_v * dt
        return self._emit()

    def update(self, dt_ms, home_closed):
        dt = dt_ms / 1000.0
        if self.fault or dt <= 0:
            return 0
        if not self.homed:
            return self._home(dt, home_closed)
        d = self.goal - self.pos
        if abs(d) < 0.5 / self.k and abs(self.v) < self.accel * dt:
            self.v = 0.0
            return 0
        toward = 1.0 if d > 0 else -1.0
        # The fastest speed from which the axis can still stop at the goal, capped at vmax; the speed moves toward
        # it by at most accel x dt per tick (a trapezoid, or a triangle on a short move).
        # (discrete form: from speed n x a x dt, braking a x dt per tick covers a x dt^2 x n (n + 1) / 2, so the axis
        # lands at about one tick's worth of speed instead of snapping to rest from a fast approach)
        adt = self.accel * dt
        want = toward * min(self.vmax, adt * (math.sqrt(0.25 + 2 * abs(d) / (adt * dt)) - 0.5))
        dv = _clamp(want - self.v, -self.accel * dt, self.accel * dt)
        v = self.v + dv
        v = _clamp(v, -self.vmax, self.vmax)
        step = v * dt
        if (d > 0 and step > d) or (d < 0 and step < d):
            step, v = d, 0.0                                 # land on the goal
        self.v = v
        self.pos += step
        return self._emit()


# PeriodTach averages its newest periods until they span this long, at most four (README "A tach that averages a fixed
# time"): at 40 ms, one revolution under 1,500 rpm, four from 6,000. 0 (always four revolutions) stays the default:
# 40 ms settled the slow wheels better on the simulator but put the drop fits 3-5% low behind a 30 ms ESC lag.
TACH_WINDOW_US = 0
PERIOD_RING = 128     # periods each tach keeps for the drop fit: 0.39 s after a ball at 7,000 rpm is 46 revolutions


def _solve_small(m, v):
    """Gauss-Jordan for the 2x2 / 3x3 normal equations of `drop_from_periods`; None if singular."""
    n = len(v)
    a = [list(m[r]) + [v[r]] for r in range(n)]
    for c in range(n):
        p = c
        for r in range(c + 1, n):
            if abs(a[r][c]) > abs(a[p][c]):
                p = r
        if abs(a[p][c]) < 1e-30:
            return None
        a[c], a[p] = a[p], a[c]
        for r in range(n):
            if r != c:
                f = a[r][c] / a[c][c]
                for k in range(c, n + 1):
                    a[r][k] -= f * a[c][k]
    return [a[r][n] / a[r][r] for r in range(n)]


def _deficit_fit(periods, w0, j0, t_start, t0, quad):
    """Least squares of the revolutions from `j0` on (times relative to `t_start`, the start of revolution j0) for a
    speed that is w0 before the ball at t0 and w0 - D + c (t - t0) [+ c2 (t - t0)^2] after it. Each revolution's mean
    speed is 1 / period, so each row integrates that deficit over the revolution. Returns (sse, D) or None."""
    k = 3 if quad else 2
    m = [[0.0] * k for _ in range(k)]
    v = [0.0] * k
    rows = []
    a = t_start
    for p in periods[j0:]:
        b = a + p
        lo = a if a > t0 else t0
        u1, u2 = lo - t0, b - t0
        row = [(u2 - u1) / p, -(u2 * u2 - u1 * u1) / (2 * p)]
        if quad:
            row.append(-(u2 * u2 * u2 - u1 * u1 * u1) / (3 * p))
        y = w0 - 1.0 / p
        rows.append((row, y))
        for r in range(k):
            v[r] += row[r] * y
            for c in range(k):
                m[r][c] += row[r] * row[c]
        a = b
    x = _solve_small(m, v)
    if x is None:
        return None
    sse = 0.0
    for row, y in rows:
        e = y
        for r in range(k):
            e -= row[r] * x[r]
        sse += e * e
    return sse, x[0]


def drop_from_periods(periods, min_fall=0.003):
    """A ball's whole speed drop on one wheel, from that wheel's revolution periods around it (2026-11-16, README "The
    drop from the pulse times").

    The lowest single-revolution reading shows only part of a drop: the ball lands somewhere inside a revolution, and
    the speed loop is already pulling the wheel back by the next one, more so at low speed. Read naively, the drops
    made a drill's fitted speed efficiency 3-6% off. Here the pulse times themselves are fitted: the wheel turns at w0
    until the ball at an unknown moment t0 inside the first slowed revolution J, then at w0 - D, recovering along a
    line (three revolutions from J) or a parabola (four or five), each revolution's mean speed being 1 / its period.
    For each t0 on a grid over revolution J the model is linear in D and the recovery terms; the t0 with the least
    residual wins. w0 is the mean of the three revolutions before the slowest one's predecessor.

    `periods` are microseconds, oldest first, ending where the readings may no longer be trusted (the Pi changed the
    targets, or the verdict). Returns (D / w0, w0 in rpm, revolutions used) or None when there are too few
    revolutions after the ball for a line (then the caller keeps the lowest-reading drop)."""
    n = len(periods)
    if n < 6:
        return None
    k = 0
    for j in range(1, n):
        if periods[j] > periods[k]:
            k = j
    if k < 4:
        return None
    w0 = 3.0 / (periods[k - 4] + periods[k - 3] + periods[k - 2])
    J = k - 1 if 1.0 / periods[k - 1] < w0 * (1.0 - min_fall) else k
    after = n - J
    if after < 3:
        return None
    quad = after >= 4
    use = periods[:J + (5 if quad else 3)]
    best = None
    lo, hi = 0.0, float(use[J])
    for _ in range(3):                   # a coarse grid over revolution J, then two finer ones around its best point
        step = (hi - lo) / 8
        for g in range(9):
            t0 = lo + step * g
            r = _deficit_fit(use, w0, J, 0.0, t0, quad)
            if r is not None and (best is None or r[0] < best[0]):
                best = (r[0], r[1], t0)
        if best is None:
            return None
        lo, hi = max(0.0, best[2] - step), min(float(use[J]), best[2] + step)
    drop = best[1] / w0
    if not 0.0 < drop < 1.0:
        return None
    return drop, w0 * 60e6, len(use) - J


# The wheel lags its ESC command by one time constant, unknown on a real build: drop_from_commands searches this grid
# (0.1-1.6 s, ratio 2), then golden-section steps between the best point's neighbours. A 9-point grid scored the same
# on tests/drop_snapshot_capture.py's snapshots (README "A recovery shaped by the loop's own commands").
LOOP_TAU_GRID_US = (100000, 200000, 400000, 800000, 1600000)
LOOP_PENDING = 32     # LAUNCH flags bit 5: the loop-command fit of this record is under way; the record comes again
# LAUNCH flags bits 6 / 7 (2026-11-16, README "When the wheel is not a first-order lag"): the top / bottom loop fit's
# drop has a standard error over this share of itself, from the fit's own misses. A jittery tach or an ESC with a lag
# of its own leaves misses the first-order model cannot absorb. On tests/loop_residual_sweep.py's single wheels 67 of
# the 72 drops more than 2% off had a larger standard error; in whole drills (tests/plant_drill_sweep.py) no wheel of
# the first-order plant was marked and 30-96% of every other plant's were (every jittery drill, but only 9-12 of 18
# drills with an ESC lag). The Pi warns on them; it does not drop them.
LOOP_SE_MAX = 0.01
LOOP_UNSURE = 64
TICK_LOG = 240        # control ticks LaunchCheck keeps per wheel for it: a 0.9 s stroke and the 0.25 s check are 115,
                      # and a slow wheel's watch past the verdict (EXTEND_MS) up to 120 more
# A queued survey's tick logs, packed (2026-11-18, README "A queued survey's heap"). Each control tick logs a tuple
# (edge count, us since that edge, the command). On the ESP32's MicroPython a 3-tuple takes two 16-byte heap blocks
# and the command a boxed float of one more, so a wheel's log costs about 48 bytes a tick, and a survey waiting in the
# queue held 11.1-12.8 KB on the simulator's drills (tests/survey_heap.py) on a heap that starts at 56 KB. Packed into
# three arrays it is 12 bytes a tick, and a queued survey 3.4-4.0 KB. The values are unchanged: the counts and times are integers, and the board's floats are single
# precision, which is what array "f" holds. On the host the command array is "d" so the simulator stays bit for bit.
_TICK_FLOAT = "f" if sys.implementation.name == "micropython" else "d"


class PackedTicks:
    """One wheel's tick log as three arrays, iterated as the (edges, us, command) tuples it was made from."""

    def __init__(self, log):
        self.c = array("l", (t[0] for t in log))
        self.us = array("l", (t[1] for t in log))
        self.u = array(_TICK_FLOAT, (t[2] for t in log))

    def __len__(self):
        return len(self.c)

    def __bool__(self):
        return len(self.c) > 0

    def __iter__(self):
        c, us, u = self.c, self.us, self.u
        for i in range(len(c)):
            yield c[i], us[i], u[i]


def pack_ticks(ticks):
    """Both wheels' tick logs packed (`PackedTicks`); a log already packed is kept as it is."""
    return [t if isinstance(t, PackedTicks) else PackedTicks(t) for t in ticks]


# A slow wheel's watch past the verdict (2026-11-16, README "Slow wheels watched past the verdict"). The verdict comes
# 250 ms after the stroke, about 0.39 s after the ball: three or four revolutions at 520-750 rpm, where the loop fit
# wants `drop_from_commands_steps`' eight after its anchor. So when a launched stroke's turning wheel has fewer than
# LOOP_AFTER_REVS after the anchor and the targets have not changed, the record goes out at the verdict as before
# (loop fit pending) and the board keeps logging that wheel's periods and ticks until it has them, the targets change
# or EXTEND_MS passes; then the loop fit runs on the longer snapshot. The Pi holds the next speeds that long
# (host.hold_s). Only wheels under about 1,500 rpm are ever short; faster ones keep the verdict's snapshot.
LOOP_AFTER_REVS = 8
EXTEND_MS = 1200
# Watching through the next shot's speed change (2026-11-17, README "The fit floor on held-out builds"; off by
# default). The watch above ends when the targets change, because a speed change's pulses are not the ball's. But the
# loop-command fit models the wheel as a lag of every command the board sent, and a speed change is only more
# commands: the drop D stays separable from the command response W h_tau as long as the wheel follows its commands.
# The Pi's hold for slow wheels (host.hold_s) made the shot after a slow one 0.6-0.9 s late on the simulator; with
# this on, the board keeps logging a short wheel's periods and ticks through a change of speed (not a stop: a coast
# down is the ESC's braking, which no command describes) and the Pi need not hold (host.LOOP_THROUGH_CHANGE). The
# verdict and the parabola's snapshot still freeze at the change, as before. A real wheel that does not follow its
# command as one lag over a 5x speed change (an ESC's own speed loop, current limit, belt slip) would bias the drop.
LOOP_THROUGH_CHANGE = False
# The ball's contact time in the loop fit (2026-11-17, README "A take that lasts a few milliseconds"; off by default):
# offsets in us from take_offsets(contact_us, shape). () models the take as one step, as before. On the simulator a
# 6 ms half-sine take read 0.98% (sd) about the true drop as a step and 0.19% with its contact time here; a build's
# contact time is unknown until a real tach log or a survey of the fits' misses (tests/take_fit.py) names it.
LOOP_TAKE = ()
# Revolutions after the ball's anchor the record's own drop fit reads (2026-11-18, README "The record's drop fit and its
# window"; `drop_from_commands_steps`' default is 8). On the simulator the longer window averages a jittery tach: held
# out (tests/record_fit_window.py, 8 builds, wheel lags 0.45 / 0.55 s) the tach-3-us builds' rms about the true drop
# fell from 0.62% to 0.47% and the worst wheel from 2.49% to 1.79%; noise-free builds moved 0.01 points or less. A fit
# has about 29 rows instead of 13, so each of its steps does about 2.2 times the arithmetic.
LOOP_FIT_AFTER = 24
# The ESC-lag survey (2026-11-16, README "The ESC lag surveyed on the board"): after each launched stroke's record, every
# turning wheel's snapshot is refitted with the commands through each of these ESC lags (esc_lagged_ticks) and the fit's
# squared residual rms is summed per lag over the balls; the least is the build's lag. The Pi reads the sums from the
# ESC_SURVEY frame, so `ESC_TAU_US` can be set from a real drill. tests/esc_lag_pick.py's grid, plus 150 ms (2026-11-18,
# README "The ESC-lag survey between 100 and 200 ms"): with nothing between 100 and 200 the log parabola read an untold
# 150 ms ESC at 169-195 on 5 of 6 simulated drills; with 150, 148-155 on all 6 (tests/esc_grid_gap.py). One more refit a
# wheel, about 17% more survey time a ball.
ESC_SURVEY_GRID_US = (0, 20000, 50000, 100000, 150000, 200000, 400000)
# The ESC-lag survey's tau golden-section steps (2026-11-18, README "The ESC-lag survey's search, traced"). It ran with
# none (tau only on LOOP_TAU_GRID_US's 100 / 200 / 400 / 800 / 1600 ms), harmless when the wheel's lag sat on that
# grid, as every build of its first check did (0.2 / 0.4 / 0.8 s). Off the grid the ESC lag stood in for the tau the
# grid could not reach: at 0.3 and 0.6 s, 6 of 12 first-order builds picked 10-14 ms and all 12 ESC 50 ms builds
# 23-25 ms. With 5 steps (the record fit's) every first-order build picked 0 and every 50 ms build 42-55 ms
# (tests/esc_misfit_trace.py); a deeper t0 search alone changed nothing. 36 steps a fit, not 15, so a survey outlasts
# the gap between balls: SURVEY_QUEUE.
ESC_SURVEY_REFINE = 5
# Revolutions after the ball's anchor that each ESC-lag survey refit reads (2026-11-18, README "Long ESC lags: the
# survey read too little of the recovery"). It read drop_from_commands_steps' default 8, about 0.16 s at 3,000 rpm,
# where the wheel's own lag is 0.3-0.6 s: an ESC of 165 ms or more fitted almost as well at any lag from 100 to 400 ms,
# and the pick was 20-60% off on 11 of 24 such design drills while the halves of the drill agreed (a bias of the short
# window, not noise, so no rms band could flag it). The snapshot to the verdict already holds 28-118 revolutions.
# With 16: 42 of 42 design drills and 28 of 28 held-out drills (ESC 0-230 ms, wheel lags 0.35-0.6 s) within 15%
# (tests/esc_survey_window.py; 8: 31 and 21). Each refit row costs the same, so a refit is about 1.6 times the work.
# Short lags read a little low with it (40 ms: 36-37, 50 ms: 44-47), still within 15%; that was the parabola's pick, not
# the window (ESC_SURVEY_SPLINE). The record's own fit keeps 8.
ESC_SURVEY_AFTER = 16
# The ESC-lag survey's pick between grid lags (2026-11-18, README "The ESC-lag survey's pick between grid lags"): a
# natural cubic spline through all seven sums on log(lag + 10 ms) (`survey_spline_pick`) in place of the three-point
# parabola (`survey_pick`). Refit at 28 lags with the same window, the least residual sat on the true lag (40, 50 and
# 90 ms builds, to the 5 ms step): the window was not biased, the parabola was. Within 5% of the true lag: 68 of 70
# design drills (parabola 41) and, held out by its pre-registered rule, 39 of 44 (27), ESC 25-270 ms, wheel lags 0.45
# and 0.65 s (eval/esc-survey-spline-2026-11-18.txt). No refit, frame or survey time changes; the take survey keeps
# the parabola.
ESC_SURVEY_SPLINE = True
# Surveys waiting their turn (2026-11-18, same section). A new stroke used to cut the last ball's survey; now it only
# pauses it (no survey step runs while a stroke is under way or a record's fit is pending), and the surveys queue, run
# between strokes and after the drill. The oldest waiting beyond this many is dropped (`survey_cut`). Each holds one
# ball's two snapshots and tick logs (up to TICK_LOG entries a wheel), so the depth is kept small for the ESP32's heap:
# on the rally drill 2 surveyed 18-20 of 32 wheels, 3 got 20-22, 4 got 22-24 (the Pi's end wait, ESC_SURVEY_S, counted).
# 3 since 2026-11-18 (README "A queued survey's heap"): with the tick logs packed (PACK_SURVEY_TICKS) a survey holds
# 3.4-4.0 KB, not 11.1-12.8, so three pin at most 12.0 KB where two pinned 25.6 (tests/survey_heap.py, 9 drills), and
# depth 3 surveyed 2 more wheels on each of the 9 drills.
SURVEY_QUEUE = 3
# Pack a survey's tick logs before it is queued (`PackedTicks`; README "A queued survey's heap").
PACK_SURVEY_TICKS = True
# A wheel whose best fit over the grid misses by more than this many times the median wheel's best is left out of the
# sums (2026-11-16, README "One wheel's misses outvoted the drill"): with tach jitter one wheel in 56 could fit 30 times
# worse than the rest, and its square alone set the pick (0 instead of 100 ms on 6 of 102 simulated builds). 3 / 5 / 10
# scored 101 / 100 / 100 of the 102 within 10% (tests/esc_survey_weight.py); the plain sum, 93. The cause was found
# later (README "The outlier wheel was anchored past its ball", ANCHOR_BACK): with it no simulated wheel crosses the
# trim and the plain sum scores 102; the trim stays as a guard for shapes the simulator lacks.
SURVEY_TRIM = 5.0
SURVEY_KEEP = 128      # wheels whose residuals the board keeps for the median (24 bytes each); the oldest goes first
# The contact-time survey (2026-11-17, README "The contact time surveyed on the board"): as the ESC-lag survey, but each
# turning wheel is refitted at these contact times (half-sine, take_offsets) with the board's own ESC lag, and the
# least summed squared rms names the build's ball contact time for `config.TAKE_US`. tests/take_fit.py's candidates:
# refitting each wheel at them and keeping the least did as well as the true contact time. Each fit costs four times the
# exponentials of a step and keeps the tau refinement (36 steps a fit, not 15), about 5 s of control ticks a two-wheel
# ball, so it runs only while the Pi has asked for it (SURVEY_TAKE, sent for a calibration drill, which then waits).
# 2026-11-19 (README "An eight-point take grid", eval/take-grid-eight-2026-11-19.md): 7 ms added. With only 6 and 8 ms
# to bend between, the parabola read 6.6 ms takes as 6.0 and 7.15 ms ones as 8.0; on three fresh held-out sets the
# eight-point grid had 185 of 216 builds within 0.5 ms against 149, the same 15 large misses, by its pre-registered rule.
TAKE_SURVEY_GRID_US = (0, 1500, 2500, 3000, 4000, 5000, 6000, 7000, 8000)
# The take survey's t0 search depth (2026-11-18, README "The first-order take misfit traced"). At the record fit's 3
# levels a noise-free wheel's first, coarse t0 grid now and then settled in the wrong basin, so its rms against tau had
# cliffs (227 ppm at 300 ms, 42 at 305) and the golden section stopped at 277-330 ms on single candidates, with 3-12
# times the rms. The survey sums squares, so a few such wheels outvoted the rest: all three first-order instant builds
# at lag 0.3 s picked 2.5 ms. At 5 levels (60 steps a fit, not 36) every instant build of 24 picked 1 ms or less and
# every 6 ms build of 12 was named within 1 ms (tests/take_misfit_trace.py). The record fit keeps 3.
TAKE_SURVEY_LEVELS = 5
# The take survey's window, revolutions after the ball's anchor (2026-11-18, README "The take survey's window"). Not the
# record fit's 24 (LOOP_FIT_AFTER): the take's effect sits in the first revolutions after the ball, so a longer window
# adds rows where every candidate fits alike and pulls the best / step share toward 1. Held out (lag 0.45 s, seed 11,
# 36 survey drills): spread takes named and advised 12 with 8, 9 with 24; on a 3 us jittery tach no window advised any
# build (shares 0.90-1.00), so the window does not rescue the jitter either.
TAKE_SURVEY_AFTER = 8
# The take survey's trim (2026-11-18, README "Take-blind rows traced"): 0 sums every wheel. A candidate whose take lands
# inside one revolution fits as the step does, so only the wheels whose ball's take straddles a revolution's edge tell
# the candidates apart, and on those even the right candidate fits 10-20 times worse than on the rest. SURVEY_TRIM's
# 5 x the median wheel's best dropped exactly those wheels once the clock was fine enough to lower the median: at 1/8 us
# the held-out set named and advised 14 of 54 spread takes with it and 42 without (tests/take_survey_trim.py). At whole
# microseconds it never fired on 432 stored drills. The ESC-lag survey keeps SURVEY_TRIM.
TAKE_SURVEY_TRIM = 0
# The take survey's take-blind wheels (2026-11-18, README "The take survey skips take-blind wheels"): a wheel whose
# worst candidate's squared rms is at most TAKE_SURVEY_BLIND times its best's cannot tell the candidates apart (its
# ball's take fits inside one revolution, so every candidate fits as the step does). It adds the same to every sum, so
# it cannot move the pick, but it pulls the best / step share toward 1 and hides the advice; such wheels are left out.
# 1 (or 0) keeps every wheel. Chosen on ten stored sets, held out on two fresh ones (eval/take-survey-blind-2026-11-18.md).
TAKE_SURVEY_BLIND = 1.5

# The take survey's pick between grid sums (2026-11-18, eval/take-survey-fresh-2026-11-18.md): False refines the least
# sum by `survey_pick`'s three-point parabola, True by `survey_spline_pick`'s natural spline on log(take + grid[1] / 2).
# With the stretched offsets (TAKE_MATCH_SPREAD) the residual's own least sits on the true take on two fresh simulated
# sets, and the parabola read off-grid takes about 0.5 ms below it on the capture tach (the spline 0.3-0.4).
TAKE_SURVEY_SPLINE = False


class ResidualSurvey:
    """Each surveyed wheel's squared residual rms per candidate on `grid` (the last SURVEY_KEEP wheels), summed over the
    wheels whose best fit is within `trim` times the median wheel's best (None reads SURVEY_TRIM; 0 sums every wheel),
    leaving out with `blind` > 1 a wheel whose worst candidate is within `blind` times its best (TAKE_SURVEY_BLIND),
    and the least sum refined by `survey_pick` (or `survey_spline_pick` with TAKE_SURVEY_SPLINE). The ESC-lag survey's arithmetic (LaunchCheck.survey_add /
    _survey_sums) for another grid."""

    def __init__(self, grid, trim=None, blind=0):
        self.grid = tuple(grid)
        self.trim = trim
        self.blind = blind          # > 1: leave out a wheel whose worst candidate is within this of its best
        self.blind_n = 0            # wheels left out as take-blind
        self.kept_n = 0             # wheels added to the sums (the TAKE_SURVEY frame's informative count, to 255)
        self.wheels = []
        self.n = 0
        self.trimmed = 0
        self._kept = 0
        self._sums = None
        self._sums_n = -1

    def add(self, got):
        if self.blind > 1 and max(got) <= self.blind * min(got):
            self.blind_n += 1       # the same to every sum: cannot move the pick, only dilute the share
            self.n += 1
            return
        self.wheels.append(array("f", got))
        self.kept_n += 1
        if len(self.wheels) > SURVEY_KEEP:
            self.wheels.pop(0)
        self.n += 1

    def sums(self):
        if self._sums_n != self.n:
            trim = SURVEY_TRIM if self.trim is None else self.trim
            best = sorted(min(w) for w in self.wheels)
            cap = trim * trim * best[len(best) // 2] if best else 0.0
            sums = [0.0] * len(self.grid)
            kept = 0
            for w in self.wheels:
                if trim <= 0 or min(w) <= cap:
                    kept += 1
                    for i in range(len(sums)):
                        sums[i] += w[i]
            self._sums, self._kept, self.trimmed, self._sums_n = sums, kept, len(self.wheels) - kept, self.n
        return self._sums

    def report(self, unit_us):
        """(wheels surveyed, the least sum's candidate and the refined one in `unit_us`, each candidate's mean rms in
        1e-6 of the pre-ball speed) or None before the first wheel."""
        if self.n == 0:
            return None
        sums = self.sums()
        if self.wheels == [] and self.blind_n:
            # every wheel so far take-blind: the count still goes out (the Pi waits on it), with no pick and no rms
            return (min(255, self.n), 0, 0, [0] * len(self.grid))
        i, ref = (survey_spline_pick if TAKE_SURVEY_SPLINE else survey_pick)(self.grid, sums)
        if i is None:
            return None
        rms = [min(65535, int(round(1e6 * math.sqrt(v / self._kept)))) for v in sums]
        return (min(255, self.n), int(round(self.grid[i] / unit_us)), int(round(ref / unit_us)), rms)


def survey_pick(grid, sums):
    """(index of the least sum, a lag in us refined between its neighbours by a parabola through the three sums, in the
    lag's log when the lower neighbour is above 0, else in the lag) or (None, None) with no sums. The refined lag stays
    inside the neighbours' span; at either end of the grid it is the grid point."""
    if not sums or not any(sums):
        return None, None
    i = 0
    for k in range(1, len(sums)):
        if sums[k] < sums[i]:
            i = k
    if i == 0 or i == len(grid) - 1:
        return i, float(grid[i])
    lg = grid[i - 1] > 0
    x = [math.log(g) if lg else float(g) for g in grid[i - 1:i + 2]]
    y = sums[i - 1:i + 2]
    d1, d2 = (y[1] - y[0]) / (x[1] - x[0]), (y[2] - y[1]) / (x[2] - x[1])
    curv = (d2 - d1) / (x[2] - x[0])
    if curv <= 0:
        return i, float(grid[i])
    xm = (x[0] + x[1]) / 2 - d1 / (2 * curv)
    xm = min(max(xm, x[0]), x[2])
    return i, math.exp(xm) if lg else xm


def survey_spline_pick(grid, sums, offset=None):
    """(index of the least sum, a lag in us at the least of a natural cubic spline through every sum) or (None, None)
    with no sums (2026-11-18, README "The ESC-lag survey's pick between grid lags"). The spline runs on log(lag +
    `offset`), `offset` half of grid[1] when None, so the 0 lag has a place on the axis. Its least is found in closed
    form on the two segments either side of the least sum, so the refined lag stays inside the neighbours' span, as
    `survey_pick`'s does; at either end of the grid it is the grid point. The three-point parabola reads a V-shaped,
    lopsided residual curve off the vertex: an untold 40-50 ms ESC read 36-47 and 210-250 ms read 222-271."""
    if not sums or not any(sums):
        return None, None
    n = len(sums)
    i = 0
    for k in range(1, n):
        if sums[k] < sums[i]:
            i = k
    if i == 0 or i == n - 1 or n < 3:
        return i, float(grid[i])
    c = grid[1] / 2 if offset is None else offset
    x = [math.log(g + c) for g in grid]
    y = sums
    h = [x[k + 1] - x[k] for k in range(n - 1)]
    # second derivatives M of the natural spline (M[0] = M[n-1] = 0): a tridiagonal solve
    b = [1.0] * n
    d = [0.0] * n
    for k in range(1, n - 1):
        b[k] = 2 * (h[k - 1] + h[k])
        d[k] = 6 * ((y[k + 1] - y[k]) / h[k] - (y[k] - y[k - 1]) / h[k - 1])
        w = (h[k - 1] if k > 1 else 0.0) / b[k - 1]
        b[k] -= w * (h[k - 1] if k > 1 else 0.0)
        d[k] -= w * d[k - 1]
    m = [0.0] * n
    for k in range(n - 2, 0, -1):
        m[k] = (d[k] - h[k] * m[k + 1]) / b[k]
    best_y, best_x = y[i], x[i]
    for s in (i - 1, i):
        q = h[s] * h[s] / 6
        y0, y1, m0, m1 = y[s], y[s + 1], m[s], m[s + 1]
        # dy/dt on t in [0, 1]: (y1 - y0) + q (-2 m0 - m1 + 6 m0 t + 3 (m1 - m0) t^2)
        a2, a1, a0 = 3 * q * (m1 - m0), 6 * q * m0, (y1 - y0) - q * (2 * m0 + m1)
        roots = []
        if abs(a2) < 1e-30:
            if a1 != 0:
                roots.append(-a0 / a1)
        else:
            disc = a1 * a1 - 4 * a2 * a0
            if disc >= 0:
                r = math.sqrt(disc)
                roots += [(-a1 - r) / (2 * a2), (-a1 + r) / (2 * a2)]
        for t in roots:
            if 0 < t < 1:
                u = 1 - t
                v = u * y0 + t * y1 + ((u * u * u - u) * m0 + (t * t * t - t) * m1) * q
                if v < best_y:
                    best_y, best_x = v, x[s] + h[s] * t
    return i, math.exp(best_x) - c


def _seg_int(u, hs, x, y, s, tau):
    """Integral over [x, y] of h(t) = u + (hs - u) e^-(t - s)/tau, the command response inside one constant-command
    segment that starts at s with h(s) = hs."""
    return u * (y - x) + (hs - u) * tau * (math.exp(-(x - s) / tau) - math.exp(-(y - s) / tau))


def _cmd_columns(T, j0, j1, segs, tau):
    """Per revolution j0..j1-1: (e, h), its mean of e^-(t - T[j0])/tau and of the command response h (minus the
    command before the window), over the revolution's span. `segs` is [(start, command)], the first at T[j0]."""
    ts = T[j0]
    u0 = segs[0][1]
    # h at each segment's start; h(ts) = u0 (the free terms absorb whatever the wheel was doing before ts)
    hs = [u0]
    for i in range(1, len(segs)):
        s, u = segs[i - 1]
        hs.append(u + (hs[-1] - u) * math.exp(-(segs[i][0] - s) / tau))
    out = []
    si = 0
    for j in range(j0, j1):
        a, b = T[j], T[j + 1]
        p = b - a
        e = tau * (math.exp(-(a - ts) / tau) - math.exp(-(b - ts) / tau)) / p
        while si + 1 < len(segs) and segs[si + 1][0] <= a:
            si += 1
        h = 0.0
        x = a
        i = si
        while x < b:
            y = segs[i + 1][0] if i + 1 < len(segs) and segs[i + 1][0] < b else b
            s, u = segs[i]
            h += _seg_int(u - u0, hs[i] - u0, x, y, s, tau)
            x = y
            i += 1
        out.append((e, h / p))
    return out


# The anchor's walk back (2026-11-16, README "The outlier wheel was anchored past its ball"): the fit anchors on the
# longest period, k, and searches the ball's time only from the start of k - 1 to the end of k + 1. Behind a slow
# recovery (a 40-100 ms ESC lag on a 0.4-0.8 s wheel) the revolutions after the ball are nearly level, about 10 us apart
# at 5,500 rpm, and 5 us of tach jitter could make the second one after the ball the longest: the ball then fell outside
# the search and that wheel missed by 7-35 x the median wheel's rms. On 144 jittery builds (8,064 wheels) all 21 wheels
# over SURVEY_TRIM were this; with the walk back none were (tests/survey_outlier_cause.py). k steps back while the
# period before it already holds over this share of k's rise above the periods before the ball (at most 2 steps); 0
# keeps the plain longest period.
ANCHOR_BACK = 0.9


def _anchor(periods, back=None, steps=2, per=1):
    """The revolution `drop_from_commands_steps` anchors on: the longest period, walked back over a level run
    (`back` None reads ANCHOR_BACK). `per` (2026-11-19, README "More tach pulses a revolution"): the periods are
    1 / per of a revolution each (already scaled to a whole revolution's length), so the revolution counts scale."""
    if back is None:
        back = ANCHOR_BACK
    k = 0
    for j in range(1, len(periods)):
        if periods[j] > periods[k]:
            k = j
    if back <= 0 or k < 4 * per:
        return k
    pb = sorted(periods[max(0, k - 8 * per):k - 2 * per])
    base = pb[len(pb) // 2]
    for _ in range(steps * per):
        if k < 4 * per or periods[k - 1] - base <= back * (periods[k] - base):
            break
        k -= 1
    return k


def magnet_spacing(periods, per):
    """Each magnet's share of a revolution, from a tach's periods at a steady or slowly changing speed (2026-11-19,
    README "More tach pulses a revolution"). `periods` start at magnet 0's edge. Each period is taken over the mean of
    the whole revolution ending with it and the one starting with it, which is exactly per times the period at its own
    place on a linear change of speed, so a wheel still settling does not lean the shares; the shares are averaged by
    magnet and scaled to sum to 1. Returns `per` shares, or None with fewer than three whole revolutions. A
    once-a-revolution tach is [1.0]."""
    n = len(periods)
    if per == 1:
        return [1.0]
    if n < 3 * per:
        return None
    acc = [0.0] * per
    cnt = [0] * per
    for j in range(per - 1, n - per + 1):
        back = sum(periods[j - per + 1:j + 1])
        fwd = sum(periods[j:j + per])
        acc[j % per] += periods[j] * 2.0 / (back + fwd)
        cnt[j % per] += 1
    sh = [acc[i] / cnt[i] for i in range(per)]
    tot = sum(sh)
    return [x / tot for x in sh]


# Half-sine take offsets stretched to the profile's own spread (2026-11-18, README "The take fit's four parts and its
# high reading"; on by its pre-registered rule). Four equal shares at the half-sine's quantile midpoints carry a
# variance of 0.0397 T^2 against the profile's 0.0474 T^2, so the fit matched a true take with a contact time about 9%
# longer: held out (tests/take_parts_refit.py, 54 simulated survey drills) the survey's residual least read off-grid
# takes +0.31 ms high on the capture tach; stretched about T/2 by sqrt(0.0474 / 0.0397) it read -0.07 (16 parts: 0.00),
# the board's verdict came within 0.5 ms on 46 builds of 54 against 41, and within 1 ms on 54 as before. The drop read
# at the true contact time moved by 0.03 points or less (tests/take_parts_refit.py --drops). Same four fits a wheel.
# False gives the midpoints as before; "front" is not stretched (not tested).
TAKE_MATCH_SPREAD = True
_HALF_SINE_VAR = 0.25 - 2.0 / (math.pi * math.pi)


def take_offsets(take_us, shape="halfsine", parts=4, match_spread=None):
    """The offsets (us after first contact) of `parts` equal shares of a ball's take that lasts `take_us`, at the
    quantile midpoints of its force profile: "halfsine" (force rising and falling symmetrically) or "front" (force at
    its peak at first contact, falling linearly). For drop_from_commands_steps(take=); 0 us gives () (one step).
    `match_spread` (default TAKE_MATCH_SPREAD) stretches the half-sine's offsets about the take's middle so that they
    carry the profile's own variance."""
    if take_us <= 0:
        return ()
    xs = []
    for i in range(parts):
        q = (i + 0.5) / parts
        if shape == "front":
            x = 1.0 - math.sqrt(1.0 - q)
        elif shape == "halfsine":
            x = math.acos(1.0 - 2.0 * q) / math.pi
        else:
            raise ValueError(shape)
        xs.append(x)
    if shape == "halfsine" and (TAKE_MATCH_SPREAD if match_spread is None else match_spread):
        var = sum((x - 0.5) * (x - 0.5) for x in xs) / parts
        k = math.sqrt(_HALF_SINE_VAR / var) if var > 0 else 1.0
        xs = [0.5 + (x - 0.5) * k for x in xs]
    return tuple(x * take_us for x in xs)


def _stopped(was, now):
    """True when a wheel turning in `was` has no target in `now` (a stop: the coast down is the ESC's braking)."""
    return any(w > 0 and n <= 0 for w, n in zip(was, now))


def drop_from_commands_steps(periods, ticks, min_fall=0.003, pre=4, after=8, taus=LOOP_TAU_GRID_US, refine=5, levels=3,
                             edges=False, back=None, polish=True, take=(), angles=None, per=1):
    """A ball's whole drop on one wheel from its revolution periods and the ESC commands the speed loop sent around it
    (2026-11-16, README "A recovery shaped by the loop's own commands").

    `drop_from_periods` lets the recovery be a free parabola, but the loop's recovery has a shape of its own: the
    tach's 4-revolution mean sees the drop late, then the PI pulls, overshoots and its integrator lets go. Which part
    of that the parabola meets depends on the speed, and on the simulator it read up to 1.5% high at 2,500 rpm and 1.2%
    low at 5,500. This board knows every command it sent, so the recovery needs no shape guessed: the wheel follows
    its command as a first-order lag (one unknown time constant tau),

        w(t) = c + A e^-(t - ts)/tau + W h_tau(t) - D e^-(t - t0)/tau [t > t0]

    with h_tau the commands' response through that lag and t0 the ball. Each revolution's mean speed is 1 / its period;
    for a given tau and t0 that is linear in c, A, W and D (c is free, so an ESC whose speed is not proportional to
    its throttle still fits). tau is searched on `taus` and refined by golden section, t0 on nested grids over the two
    revolutions either side of the slowest one's start (a ball late in a revolution slows it by less than `min_fall`).

    `periods` as for `drop_from_periods`. `ticks` are the control ticks over the same span: (edges into `periods`
    before the tick, us since that edge, the command the tick set). Returns (D / the speed just before the ball,
    that speed in rpm, revolutions used, tau in us, the rms miss per revolution as a share of that speed) or None (too little to fit: the caller falls back).

    A generator, so the board can spread the work over its control ticks (`LaunchCheck` advances it one step a tick):
    it yields None after each t0 grid of each tau tried, about 36 steps, and its last item is ("fit", result).
    `drop_from_commands` runs it to the end.

    `polish` (2026-11-17, README "Not the simulator's step either") adds one solve after each tau's last t0 grid, at
    the vertex of the parabola through the grid's best point and its neighbours: no extra step, and on
    tests/fit_grid_floor.py's 755 noise-free wheels the readings' scatter about the true drop fell from 0.32% / 0.27%
    (first-order / ESC 50 ms plants) to 0.15% / 0.15%. The 3-level grid's last step, 1/64 of a revolution, was the
    floor; a fourth level does as well again (0.12%) but costs 12 more steps a wheel.

    `per` and `angles` (2026-11-19, README "More tach pulses a revolution"; host-side, the board still sends one
    pulse a revolution): a tach with `per` magnets a revolution gives `per` periods a revolution, each the time the
    wheel took to turn `angles[j]` of a revolution (the magnets' spacing, learnt at a steady speed by
    `magnet_spacing`; None is 1 / per each). The spans stay the real times; each period's mean speed is angles[j] /
    periods[j]; `pre`, `after`, the anchor's search and the ball's window are still counted in revolutions."""
    n = len(periods)
    if angles is None and per == 1:
        rp = periods
    else:
        if angles is None:
            angles = [1.0 / per] * n
        rp = [periods[j] / (angles[j] * per) for j in range(n)]   # each period stretched to a whole revolution's
    pre, after = pre * per, after * per
    if n < pre + 4 * per:
        yield ("fit", None)
        return
    k = _anchor(rp, back, per=per)
    if k < pre + 1:
        yield ("fit", None)
        return
    w0 = 3.0 * per / sum(rp[k - 4 * per:k - per])
    J = k - 1 if 1.0 / rp[k - 1] < w0 * (1.0 - min_fall) else k
    j0, j1 = k - 1 - pre, min(n, J + after)
    if j1 - k < 3 * per:
        yield ("fit", None)
        return
    T = [0.0]
    for p in periods:
        T.append(T[-1] + p)
    ts, tend = T[j0], T[j1]
    u0 = None
    segs = []
    for c, since, u in ticks:
        if 0 <= c < len(T):
            t = T[c] + since
            if t <= ts:
                u0 = u
            elif t < tend:
                segs.append((t, u))
    if u0 is None:
        yield ("fit", None)
        return
    segs.insert(0, (ts, u0))
    # deficits below w0, as fractions of it: small numbers, so MicroPython's single-precision floats keep them
    ys = [1.0 - 1.0 / (rp[j] * w0) for j in range(j0, j1)]
    t_lo, t_hi = T[max(0, k - per)], T[min(n, k + per)]
    if take:
        # first contact can come up to the take's last share before the revolution the fall shows in
        t_lo = max(T[j0], t_lo - take[-1])

    nr = j1 - j0
    pbar = (T[j1] - T[j0]) / nr
    wts = [(T[j0 + idx + 1] - T[j0 + idx]) / pbar for idx in range(nr)]
    # edge form (2026-11-16, README "The drop on the edge times"): each edge's angle lag behind w0, in revolutions,
    # is the running sum of the revolutions' deficits times their spans. A tach's jitter moves each edge time once, so
    # here it is one independent error per row, where per revolution it is the difference of two (shared by the
    # neighbours with opposite signs). A free offset takes the window's first edge's own error.
    yrow = ys
    if edges:
        yrow, acc = [], 0.0
        for idx in range(nr):
            acc += ys[idx] * wts[idx]
            yrow.append(acc)

    def fixed(cols):
        rows = [(1.0, cols[idx][0], cols[idx][1]) for idx in range(nr)]
        if not edges:
            return rows
        out, a0, a1, a2 = [], 0.0, 0.0, 0.0
        for idx in range(nr):
            w = wts[idx]
            a0 += w
            a1 += rows[idx][1] * w
            a2 += rows[idx][2] * w
            out.append((1.0, a0, a1, a2))
        return out

    starts = take if take else (0.0,)
    share = 1.0 / len(starts)

    def dcol(tau, t0):
        # `take` (2026-11-17, README "A take that lasts a few milliseconds"): the ball's take as equal parts starting
        # at t0 + each offset (us), the contact's force profile at its quantiles (take_offsets); () is one step at t0
        ds, acc = [], 0.0
        for idx in range(nr):
            a, b = T[j0 + idx], T[j0 + idx + 1]
            d = 0.0
            for off in starts:
                t1 = t0 + off
                if b > t1:
                    x = a if a > t1 else t1
                    d += share * tau * (math.exp(-(x - t1) / tau) - math.exp(-(b - t1) / tau)) / (b - a)
            if edges:
                acc += d * wts[idx]
                d = acc
            ds.append(d)
        return ds

    def one(tau, out):
        F = fixed(_cmd_columns(T, j0, j1, segs, tau))
        nf = len(F[0])
        # the fixed columns do not move with t0: their normal-equation block is summed once per tau
        mf = [[0.0] * nf for _ in range(nf)]
        vf = [0.0] * nf
        for idx in range(nr):
            row = F[idx]
            y = yrow[idx]
            for r in range(nf):
                vf[r] += row[r] * y
                for q in range(r, nf):
                    mf[r][q] += row[r] * row[q]
        for r in range(nf):
            for q in range(r):
                mf[r][q] = mf[q][r]
        def at(t0):
            ds = dcol(tau, t0)
            cross = [0.0] * nf
            mdd = vd = 0.0
            for idx in range(nr):
                d = ds[idx]
                if d:
                    row = F[idx]
                    for r in range(nf):
                        cross[r] += d * row[r]
                    mdd += d * d
                    vd += d * yrow[idx]
            m = [mf[r] + [cross[r]] for r in range(nf)] + [cross + [mdd]]
            x = _solve_small(m, vf + [vd])
            if x is None:
                return None
            sse = 0.0
            for idx in range(nr):
                e = yrow[idx] - x[nf] * ds[idx]
                row = F[idx]
                for r in range(nf):
                    e -= x[r] * row[r]
                sse += e * e
            return (sse, t0, x, m)

        best = None
        lo, hi = t_lo, t_hi
        for _ in range(levels):
            step = (hi - lo) / 8
            grid = []
            for g in range(9):
                f = at(lo + step * g)
                grid.append(f)
                if f is not None and (best is None or f[0] < best[0]):
                    best = f
            if best is None:
                out.append(None)
                return
            lo, hi = max(t_lo, best[1] - step), min(t_hi, best[1] + step)
            yield None
        if polish:
            # the last grid's best point and its two neighbours: one more solve at their parabola's vertex (README
            # "Not the simulator's step either"); kept only if its misses are smaller
            g = next((i for i in range(1, 8) if grid[i] is best), None)
            if g is not None and grid[g - 1] is not None and grid[g + 1] is not None:
                sm, s0, sp = grid[g - 1][0], best[0], grid[g + 1][0]
                curv = sm - 2.0 * s0 + sp
                if curv > 0:
                    f = at(best[1] + step * 0.5 * (sm - sp) / curv)
                    if f is not None and f[0] < best[0]:
                        best = f
        out.append((best[0], best[1], best[2], tau, best[3]))

    def run(tau):
        out = []
        yield from one(tau, out)
        return out[0] if out else None

    res = []
    for tau in taus:
        r = yield from run(float(tau))
        if r is not None:
            res.append(r)
    if not res:
        yield ("fit", None)
        return
    bi = 0
    for i in range(1, len(res)):
        if res[i][0] < res[bi][0]:
            bi = i
    best = res[bi]
    if refine and 0 < bi < len(res) - 1:
        gr = 0.6180339887
        lo, hi = math.log(res[bi - 1][3]), math.log(res[bi + 1][3])
        c, d = hi - gr * (hi - lo), lo + gr * (hi - lo)
        fc = yield from run(math.exp(c))
        fd = yield from run(math.exp(d))
        for _ in range(refine):
            if fc is None or fd is None:
                break
            if fc[0] < fd[0]:
                hi, d, fd = d, c, fc
                c = hi - gr * (hi - lo)
                fc = yield from run(math.exp(c))
            else:
                lo, c, fc = c, d, fd
                d = lo + gr * (hi - lo)
                fd = yield from run(math.exp(d))
        for r in (fc, fd):
            if r is not None and r[0] < best[0]:
                best = r
    sse, t0, xs, tau, mn = best
    c1, A, Wn, D = xs[-4:]
    # the deficit just before the ball, c1 + A e(t0) + W h(t0): the drop is reported as a share of that speed
    e_t0 = math.exp(-(t0 - ts) / tau)
    h_t0 = 0.0
    hcur = 0.0
    for i in range(len(segs)):
        s, u = segs[i]
        nxt = segs[i + 1][0] if i + 1 < len(segs) else tend
        if t0 < nxt or i + 1 == len(segs):
            h_t0 = (u - u0) + (hcur - (u - u0)) * math.exp(-(t0 - s) / tau)
            break
        hcur = (u - u0) + (hcur - (u - u0)) * math.exp(-(nxt - s) / tau)
    before = 1.0 - (c1 + A * e_t0 + Wn * h_t0)
    drop = D / before if before > 0 else 0.0
    if not 0.0 < drop < 1.0:
        yield ("fit", None)
        return
    # rms of the fit's misses per row, as a share of the pre-ball speed (2026-11-16 later, README "When the wheel
    # is not a first-order lag"): 6 fitted numbers (c, A, W, D, tau, t0), 7 with the edge form's offset. In the edge
    # form a row's miss is an edge's angle in revolutions (times the pre-ball speed), so the two forms' rms differ in kind.
    nx = len(xs)
    dof = nr - nx - 2
    s2 = sse / dof if dof > 0 else 0.0
    rms = math.sqrt(s2) / before
    # the drop's standard error at this tau and t0, from the normal equations: sd(D)^2 = s^2 (M^-1)_DD
    unit = [0.0] * nx
    unit[-1] = 1.0
    inv = _solve_small(mn, unit)
    se = math.sqrt(s2 * inv[-1]) / before / drop if inv is not None and inv[-1] > 0 else 1.0
    # lag-1 structure of the misses (Durbin-Watson): white noise ~2, a tach's jitter on periods ~3, a shape the model
    # lacks well under 2
    F = fixed(_cmd_columns(T, j0, j1, segs, tau))
    ds = dcol(tau, t0)
    es = []
    for idx in range(nr):
        e = yrow[idx] - D * ds[idx]
        for r in range(nx - 1):
            e -= xs[r] * F[idx][r]
        es.append(e)
    num = sum((es[i] - es[i - 1]) ** 2 for i in range(1, nr))
    dw = num / sse if sse > 0 else 2.0
    yield ("fit", (drop, w0 * before * 60e6, j1 - k + 1, tau, rms, se, dw))


# An ESC with its own speed loop (2026-11-18, README "An ESC with its own speed loop"). VESC-class firmware in a speed
# mode takes the throttle as an rpm setpoint and holds it with a PI loop of its own. WheelLoop's proportional term,
# tuned for a wheel that follows its throttle as a 0.2-0.8 s lag, then rings in cascade with it: on the simulator 49 of
# 144 such wheels swung over 1% of target with no ball, the worst 139% (tests/speed_esc_sweep.py). With this on (main.py
# reads config.ESC_SPEED_LOOP), WheelLoop drops its proportional term and keeps SPEED_ESC_KI_SHARE of its integral
# gain, a slow trim for an ESC whose setpoint is not exactly throttle x WHEEL_RPM_FULL: 0 of 144 swung over 1% and the
# worst mean error was 0.05%. 0.5 sits in the band (0.5-0.7) the sweep found flat; 1.0 rang on one wheel, 0.3 had not
# trimmed a 22% map error within 5 s. Picked on the same cases it is measured on.
ESC_SPEED_LOOP = False
SPEED_ESC_KI_SHARE = 0.5


def esc_lagged_ticks(periods, ticks, esc_tau_us, dt_us=1000):
    """The tick log with each command replaced by the ESC's own drive: the commands through a lag `esc_tau_us`,
    sampled every `dt_us` (2026-11-16, README "An ESC lag picked from the build's own balls"). An ESC that ramps its
    output puts a second lag between the command and the wheel; `drop_from_commands` on these ticks fits the wheel's
    own lag on top of it. On the simulator a 40-100 ms ESC lag read the drop 1.3-4.6% low on average without it, and
    within 0.6% with the build's lag picked from its own balls (tests/esc_lag_pick.py). The drive starts at the first
    logged command. `esc_tau_us` 0 returns `ticks` unchanged."""
    if esc_tau_us <= 0 or not ticks:
        return ticks
    T = [0]
    for p in periods:
        T.append(T[-1] + p)
    ev = sorted((T[c] + since, u) for c, since, u in ticks if 0 <= c < len(T))
    if not ev:
        return ticks
    a = 1.0 - math.exp(-dt_us / esc_tau_us)
    t, d = ev[0][0], ev[0][1]
    out, i, c = [], 0, 0
    while t < T[-1]:
        while i + 1 < len(ev) and ev[i + 1][0] <= t:
            i += 1
        d += (ev[i][1] - d) * a
        t += dt_us
        while c + 1 < len(T) and T[c + 1] <= t:
            c += 1
        out.append((c, t - T[c], d))
    return out


def drop_from_commands(periods, ticks, **kw):
    """`drop_from_commands_steps` run to the end: (drop, rpm, revolutions, tau in us, residual rms) or None."""
    for step in drop_from_commands_steps(periods, ticks, **kw):
        if step is not None:
            return step[1]
    return None


class PeriodTach:
    """Wheel speed from the time between a once-per-revolution sensor's pulses (2026-11-11).

    The old tachometer counted pulses in each 10 ms control tick and scaled by 60000 / dt, so its only readings were
    0, 6000, 12000 rpm...: at a 3000 rpm wheel (50 rev/s) it read 0 and 6000 in turn, the wheel-speed loop chased
    that noise and the feed gate's "within 5%" test almost never passed. Timing each revolution instead gives the
    speed to a microsecond clock's resolution.

    The board calls `edge(period_us)` from the pulse interrupt with the time since the previous pulse (integers
    only, no allocation: safe in a MicroPython IRQ) and `rpm(since_us)` from the control loop with the time since the
    last pulse. The reading is the mean of the last `n` periods; while the wheel slows and no pulse has come for
    longer than that mean, the open period is used instead, so the reading falls rather than freezing. No pulse for
    `stall_us` reads 0, and the first pulse after such a gap starts the average afresh. Edges closer together than `min_period_us` (above `max_rpm`) are electrical noise, ignored.
    """

    def __init__(self, n=4, max_rpm=12000, stall_us=250000, ring=PERIOD_RING, window_us=None, sub=1):
        self.periods = [0] * n
        # `sub` (2026-11-18, README "Periods finer than a microsecond"): edge() takes periods in units of 1 / sub us,
        # so a capture-timed tach (CaptureClock(sub=...)) keeps the 80 MHz counter's resolution instead of flooring it
        # to whole microseconds. Everything stored (periods, ring, carry) is in those units, still small ints (a stall's
        # 250,000 us at sub 80 is 2e7, under MicroPython's 2**30); recent() hands the fits microseconds, and rpm() /
        # rpm_last() still take `since_us` in microseconds. 1 is the old whole-microsecond tach, unchanged.
        self.sub = sub
        # The reading averages the newest periods until they span `window_us`, at most `n` of them (2026-11-16, README
        # "A tach that averages a fixed time"); 0 averages all `n`, as before. None reads TACH_WINDOW_US.
        self.window_us = TACH_WINDOW_US if window_us is None else window_us
        self._window = self.window_us * sub
        self.i = 0
        self.count = 0
        self.min_period = 60000000 * sub // max_rpm
        self.stall_us = stall_us
        self._stall = stall_us * sub
        self._rpm_k = 60000000 * sub
        self._carry = 0
        # Every accepted period, newest at ring[(edges - 1) % len], for LaunchCheck's per-shot drop fit (2026-11-16,
        # README "The drop from the pulse times"). Periods, not times: they stay small ints, so the IRQ never
        # allocates. `edges` counts accepted periods; a stall resets it to 0 with the average.
        self.ring = [0] * ring
        self.edges = 0

    def edge(self, period_us):
        # period_us is in units of 1 / self.sub us (whole microseconds at the default sub 1)
        if period_us > self._stall:
            self.reset()                     # first pulse after a stop: its "period" is the whole time stopped
            return
        period_us += self._carry
        if period_us < self.min_period:
            self._carry = period_us          # a glitch: fold it into the revolution it interrupted
            return
        self._carry = 0
        self.periods[self.i] = period_us
        self.i = (self.i + 1) % len(self.periods)
        self.ring[self.edges % len(self.ring)] = period_us
        self.edges += 1
        if self.count < len(self.periods):
            self.count += 1

    def reset(self):
        self.count = self.i = self._carry = 0
        self.edges = 0

    def recent(self, n, upto=None):
        """The last `n` periods (oldest first) up to edge count `upto` (default now), as far as the ring holds."""
        end = self.edges if upto is None else min(upto, self.edges)
        k = min(n, end, len(self.ring))
        if self.sub == 1:
            return [self.ring[j % len(self.ring)] for j in range(end - k, end)]
        s = self.sub
        return [self.ring[j % len(self.ring)] / s for j in range(end - k, end)]   # microseconds, for the fits

    def rpm(self, since_us):
        if self.count == 0 or since_us > self.stall_us:
            return 0
        k = self.count
        if self._window > 0:
            n = len(self.periods)
            total = j = 0
            while j < k:
                total += self.periods[(self.i - 1 - j) % n]
                j += 1
                if total >= self._window:
                    break
            mean = total / j
        else:
            mean = sum(self.periods[:k]) / k
        since = since_us * self.sub
        period = since if since > mean else mean
        return int(self._rpm_k / period + 0.5)

    def rpm_last(self, since_us):
        """The speed over the last revolution alone (or the open one, if longer), unaveraged: what `LaunchCheck` reads
        (2026-11-16), since a ball's drop comes and goes within a few revolutions at low speed and the 4-revolution
        mean shows only part of it before the Pi re-aims."""
        if self.count == 0 or since_us > self.stall_us:
            return 0
        last = self.periods[(self.i - 1) % len(self.periods)]
        since = since_us * self.sub
        period = since if since > last else last
        return int(self._rpm_k / period + 0.5)


class CaptureClock:
    """Whole-microsecond (or, with `sub`, 1 / sub us) periods from a hardware capture's tick counts (2026-11-18, README "A tach timed in hardware").

    `period(ticks, since_us)` takes the capture counter's ticks since the previous edge (capture.Capture.ticks(): -1
    for a gap too long to count) and the pin interrupt's own ticks_us() gap, and returns the period to hand to
    PeriodTach.edge: the ticks over `ticks_per_us`, with the remainder carried to the next edge so the periods add up
    to the edge times floored to the microsecond (what ticks_us() would read with no handler latency), never drifting.
    A gap over `stall_us` on either clock (the counter wraps every 53.7 s, so only the coarse clock can tell a long
    stop from a short one), the first edge, and a too-long count return stall_us + 1, which PeriodTach.edge takes as a
    restart. 0 ticks (the interrupt ran with no new capture) returns -1: nothing to hand on. Small ints only.
    """

    def __init__(self, stall_us=250000, ticks_per_us=80, sub=1):
        # `sub` (2026-11-18, README "Periods finer than a microsecond"): periods in units of 1 / sub us, for a
        # PeriodTach made with the same sub; it must divide ticks_per_us (80: 1, 2, 4, 5, 8, 10, 16, 20, 40 or 80).
        if sub < 1 or ticks_per_us % sub:
            raise ValueError("sub must divide ticks_per_us")
        self.k = ticks_per_us // sub
        self.sub = sub
        self.stall_us = stall_us
        self.max_ticks = stall_us * ticks_per_us
        self.rem = 0
        self.primed = False

    def period(self, ticks, since_us):
        if ticks == 0:
            return -1
        if not self.primed or ticks < 0 or ticks > self.max_ticks or since_us > self.stall_us:
            self.primed = True
            self.rem = 0
            return self.stall_us * self.sub + 1
        t = ticks + self.rem
        us = t // self.k
        self.rem = t - us * self.k
        return us


class SpinupRamp:
    """Moves a launcher wheel's speed target toward the asked speed at a capped shaft power (2026-11-14).

    Without it a new target went straight into the speed loop, whose feedforward steps the ESC's throttle at once, so
    a wheel starting from rest could take the motor's peak, about 1 kW, from the battery: two wheels at 24 V would ask
    about 98 A of a pack whose BMS allows about 30 A continuous (cad: Feeder.power_distribution), and a BMS that cuts
    out takes the Pi and the ESP32 down with it. Here the target rises at most `max_rpm_s` per second, and above the
    speed where that would need more than `power_w` (P = I w a) it rises at constant power: rpm^2 grows by 2 k dt with
    k = P / I (60 / 2 pi)^2. Lowering a target is ramped the same way (an ESC that brakes would push the energy back
    into the pack). A zero target is not ramped: stopping stays immediate. After a stop the ramp starts from the
    wheel's measured speed, so a wheel still coasting is not braked down to restart from rest.

    `brake=False` (2026-11-14, cad: Feeder.regen_braking) lets the wheel coast down instead: while the wheel is faster
    than its new target, `coasting` is set and the board sends zero throttle (a throttle that matches the wheel's
    speed would hold it there against drag, and anything lower is what an ESC brakes on), and the target follows the
    measured speed down so the loop takes over where the wheel arrives. The board passes it when the pack reads above
    REGEN_BRAKE_MAX_MV (braking into a nearly full pack lifts a cell to the BMS's cut, the BMS stops charging, and the
    braking energy lifts the bus past the H-bridge's 30 V in about a millisecond) or when WHEEL_BRAKE is False.
    """

    def __init__(self, power_w, inertia_kgm2, max_rpm_s):
        self.k = power_w / inertia_kgm2 * (60 / (2 * math.pi)) ** 2
        self.max = max_rpm_s
        self.rpm = 0.0
        self.coasting = False

    def update(self, target, measured, dt_ms, brake=True):
        self.coasting = False
        if target <= 0:
            self.rpm = 0.0
            return 0
        dt = dt_ms / 1000
        if self.rpm <= 0:
            self.rpm = min(float(measured), float(target))
        r = self.rpm
        if target > r:
            r = min(r + self.max * dt, math.sqrt(r * r + 2 * self.k * dt), target)
        elif target < r and not brake:
            r = max(min(r, float(measured)), target)                   # follow the coasting wheel down
            self.coasting = measured > target
        elif target < r:
            r = max(r - self.max * dt, math.sqrt(max(r * r - 2 * self.k * dt, 0.0)), target)
        self.rpm = r
        return r


class BrakeGuard:
    """Whether the launcher ESCs may brake, from the pack reading, with a band (2026-11-14, cad: Feeder.regen_guard).

    The board reads the pack every tick, and braking lifts that very reading: the charge current crosses the pack's
    resistance, its feed and its fuse, about 0.26 V at the threshold. With one threshold (the first firmware) a pack
    resting within that rise of REGEN_BRAKE_MAX_MV made the guard flip brake, coast, brake on every 10 ms tick, about
    126 flips in one slow-down, and the reading's own noise widened the band to about 0.6 V. So braking stops when the
    reading passes `max_mv` and is allowed again only once it reads under `max_mv - hyst_mv`. The upper threshold is
    unchanged, so the pack is never braked into above it."""

    def __init__(self, max_mv, hyst_mv):
        self.max_mv, self.hyst_mv = max_mv, hyst_mv
        self.ok = True

    def update(self, mv):
        if self.ok and mv > self.max_mv:
            self.ok = False
        elif not self.ok and mv < self.max_mv - self.hyst_mv:
            self.ok = True
        return self.ok


# Under this target the wheel loop's gains shrink with the speed (WheelLoop; README "Slow wheels need slower gains").
LOOP_LOW_RPM = 1500
# The ready gate holds for at least this many revolutions of the slowest wheel (SteadyGate; same README section).
GATE_HOLD_REVS = 6
# A ball's recovery (2026-11-17, firmware/esp32/README.md "A ball charged the integrator"): from a stroke's start until
# the wheel has dropped and climbed back to its target (or LOOP_BALL_MS passes), the loop's integrator sees its error
# clamped to +-LOOP_BALL_BAND of the target. None turns it off.
LOOP_BALL_BAND = 0.005
LOOP_BALL_MS = 3000
BALL_DROP_SEEN = 0.03         # the wheel reads this far under target: the ball has hit it
# Braking to a slow target (2026-11-17, same README section): LOOP_RAMP_HOLD freezes the integrator while SpinupRamp is
# still lowering the target; LOOP_I_FF_MAX bounds it to that share of the feedforward (None: only i_max).
LOOP_RAMP_HOLD = True
LOOP_I_FF_MAX = 0.35
# A ball's recovery with the plant gain the integrator has learned (2026-11-19, firmware/esp32/README.md "The ball
# hold on a wheel faster than told"): when a stroke starts, the steady command over the feedforward, (ff + i) / ff,
# is the told free speed over the true one, and the proportional (and integral) gains are scaled by it until the ball
# hold ends, so a wheel 22% faster than WHEEL_RPM_FULL is not driven 1.22 times as hard. False: the gains as told;
# "down": the scale capped at 1 (only a wheel faster than told gets softer gains).
LOOP_BALL_GAIN = "down"


class WheelLoop:
    """One launcher wheel's ESC command from its target and measured rpm: feedforward plus PI (2026-11-11).

    The first loop was integral only (`cmd += err x 2e-6 x dt`). On a wheel that lags its command (inertia) and is
    measured late (a once-per-rev tachometer averages the last revolutions), a pure integrator rings: in the simulated
    feeder (tests/feeder_sim.py; a first-order wheel, an assumption) the bottom wheel at a 1955 rpm target swung
    between about 1200 and 2900 rpm for ten seconds without settling. Here the command starts at target / `rpm_full`
    (the wheel's free speed at full throttle, measured once on the build: `WHEEL_RPM_FULL` in config.py), so the
    integrator only trims the error that feedforward leaves, and the proportional term damps it. The integrator is
    frozen while the command is saturated and clamped to +-`i_max` (no wind-up). Gains from tests/wheel_loop_sweep.py
    (README "Wheel speed loop"): steady within 2 s over free speeds 7000-11000 rpm and spin-up time constants
    0.2-0.8 s while the firmware is told 9000.

    Below `low_rpm` both gains shrink in proportion to the target (2026-11-16, firmware/esp32/README.md "Slow wheels
    need slower gains"). The tachometer averages its last four revolutions, so what it reads trails the wheel by about
    2.5 revolutions: 43 ms at 3,500 rpm, 0.29 s at 510 rpm. At fixed gains that delay took the loop's phase margin
    from about 66 degrees at 3,500 rpm to -48 at 510 rpm (a 0.2 s wheel behind a 30 ms ESC), and a ~510 rpm wheel
    swung 460-564 rpm and never passed the ready gate. Scaling the gains with the speed keeps the crossover a fixed
    share of the delay. 0 turns it off.

    A ball is a known kick, not an offset to learn (2026-11-17, README "A ball charged the integrator"). A ball takes
    up to ~40% of a slow wheel's speed, and the tach shows that drop late, so the integrator used to charge through the
    whole recovery: on a 0.8 s wheel at 526 rpm it reached +0.022 (about 200 rpm of command), the wheel overshot to
    625 rpm, and discharging it carried the wheel 3.6% under its target, where it crept back for about 2 s. `ball()`,
    called by the board as each stroke starts, holds the integrator to +-`ball_band` of the target from then until the
    wheel has read `BALL_DROP_SEEN` under target and come back to it (or `ball_ms` passes: an empty pocket; or the
    target changes); feedforward
    and the proportional term do the recovery. None turns it off.

    Braking did the same (same README section): the ramp lowers the target faster than a slow wheel slows, and the
    integrator absorbed that tracking error until it cancelled the whole feedforward (-0.164 against 0.058 at 526 rpm),
    so the wheel coasted to about 90 rpm before it could recover. With `ramp_hold` the integrator holds while the board
    says the ramp is still lowering the target (`ramping`), and `i_ff_max` keeps it within that share of the
    feedforward: enough for a wheel 22% off `rpm_full` (29%), not enough to switch the wheel off.
    """

    def __init__(self, rpm_full, kp=2e-4, ki=6e-7, i_max=0.3, low_rpm=LOOP_LOW_RPM, ball_band=-1.0, ball_ms=None, ramp_hold=None, i_ff_max=-1.0,
                 speed_esc=None, ball_gain=None):
        self.ff = 1.0 / rpm_full
        self.ball_gain = LOOP_BALL_GAIN if ball_gain is None else ball_gain
        self.gain = 1.0               # the gain scale latched at the stroke's start (ball_gain)
        self.last_target = 0
        if ESC_SPEED_LOOP if speed_esc is None else speed_esc:
            # The ESC holds the speed itself (README "An ESC with its own speed loop"): the board's proportional term
            # on a 4-revolution tach in cascade with it rang (+-15% at 2,500 rpm behind a 5 Hz ESC loop, no ball),
            # so the board only trims the ESC's throttle-to-rpm map, slowly.
            kp, ki = 0.0, ki * SPEED_ESC_KI_SHARE
        self.kp, self.ki, self.i_max = kp, ki, i_max
        self.low = low_rpm
        self.band = LOOP_BALL_BAND if ball_band == -1.0 else ball_band
        self.ball_ms = LOOP_BALL_MS if ball_ms is None else ball_ms
        self.ramp_hold = LOOP_RAMP_HOLD if ramp_hold is None else ramp_hold
        self.i_ff = LOOP_I_FF_MAX if i_ff_max == -1.0 else i_ff_max
        self.recover = 0              # 0 none, 1 armed (stroke under way), 2 the wheel is below target after its ball
        self.recover_ms = 0
        self.recover_target = 0
        self.i = 0.0

    def ball(self):
        """A stroke has started: a ball is about to take momentum from the wheel. Until the wheel has dropped and
        climbed back to its target, its integrator only trims (README "A ball charged the integrator")."""
        if self.band is not None:
            self.recover, self.recover_ms, self.recover_target = 1, 0, None
            if self.ball_gain and self.last_target > 0:
                f = self.last_target * self.ff
                self.gain = _clamp((f + self.i) / f, 0.5, 1.0 if self.ball_gain == "down" else 1.5)

    def update(self, target, measured, dt_ms, ramping=False):
        if target <= 0:
            self.i = 0.0
            self.last_target = 0
            return 0.0
        self.last_target = target
        g = target / self.low if self.low and target < self.low else 1.0
        if self.recover:
            g *= self.gain
        kp, ki = self.kp * g, self.ki * g
        err = target - measured
        if self.recover:
            if self.recover_target is None:
                self.recover_target = target
            self.recover_ms += dt_ms
            if target != self.recover_target:
                self.recover = 0          # new speeds: spinning to them is the integrator's work again
            elif self.recover == 1 and err > BALL_DROP_SEEN * target:
                self.recover = 2
            elif (self.recover == 2 and err <= 0) or self.recover_ms >= self.ball_ms:
                self.recover = 0
            if not self.recover:
                self.gain = 1.0
        lim = min(self.i_max, self.i_ff * target * self.ff) if self.i_ff is not None else self.i_max
        self.i = _clamp(self.i, -lim, lim)
        raw = target * self.ff + kp * err + self.i
        if (0.0 < raw < 1.0 or (raw >= 1.0 and err < 0) or (raw <= 0.0 and err > 0)) and not (ramping and self.ramp_hold):
            e = _clamp(err, -self.band * target, self.band * target) if self.recover else err
            self.i = _clamp(self.i + ki * e * dt_ms, -lim, lim)
        return _clamp(target * self.ff + kp * err + self.i, 0.0, 1.0)


class SteadyGate:
    """True once every wheel has stayed within `tol` of its target for `hold_ms` without a break (2026-11-11).

    The feed gate used one 5% in-band reading, so a ringing wheel passed it on the way through. A ball launched at the
    wrong wheel speed flies to the wrong place, so the gate now wants the speed held. 3%, not 5%: the tachometer
    averages the last revolutions, so the true speed trails what it reads; on the simulated feeder over the plant grid
    (tests/wheel_loop_sweep.py) a 5% gate let balls go at up to 6.6% true error, a 3% gate at up to 2.8%, for at most
    0.6 s more spin-up.

    The hold is also at least `hold_revs` revolutions of the slowest turning wheel (2026-11-16, README "Slow wheels
    need slower gains"). The tachometer's reading changes once a revolution, and a 510 rpm wheel turns once in 118 ms,
    so 150 ms was one or two readings of a four-revolution average and passed slow wheels up to 13% off their true
    speed on the simulator. 0 keeps the plain `hold_ms`.
    """

    def __init__(self, tol=0.03, hold_ms=150, hold_revs=GATE_HOLD_REVS):
        self.tol, self.hold, self.revs = tol, hold_ms, hold_revs
        self.need = hold_ms
        self.ok_ms = 0

    def update(self, targets, measured, dt_ms):
        inside = all(t and abs(m - t) < self.tol * t for t, m in zip(targets, measured))
        self.ok_ms = self.ok_ms + dt_ms if inside else 0
        slowest = min((t for t in targets if t > 0), default=0)
        self.need = max(self.hold, self.revs * 60000 // slowest) if self.revs and slowest else self.hold
        return self.steady

    @property
    def steady(self):
        return self.ok_ms >= self.need


class ElevationGeometry:
    """Head elevation <-> elevation actuator length, anchor hole to pin hole (2026-11-11).

    The same geometry as cad/otr_cad/params.py (`Feeder.elev_act_len`; tests check they agree): the pin sits on the
    tilting head at (pin_x, pin_z) in the head frame, the pivot `pivot_z_rel` below the ball path, and the anchor is
    fixed at (anchor_dx, anchor_dz) from the pivot. Length falls as the nose rises (371 mm at -15 deg, 248 mm at +45),
    and not in a straight line: about 0.43 deg per mm near -15 deg and 0.53 near +45, so a servo pulse spread evenly
    over the angle range lands up to 1.46 deg off in the middle.
    """

    def __init__(self, pin_x=-175.0, pin_z=60.0, pivot_z_rel=-200.0, anchor_dx=-100.0, anchor_dz=-75.0):
        self.pin_x, self.pin_z = pin_x, pin_z - pivot_z_rel
        self.ax, self.az = anchor_dx, anchor_dz

    def length(self, elev_deg):
        t = math.radians(elev_deg)
        px = self.pin_x * math.cos(t) - self.pin_z * math.sin(t)
        pz = self.pin_x * math.sin(t) + self.pin_z * math.cos(t)
        return math.hypot(px - self.ax, pz - self.az)

    def elev(self, length_mm, lo=-40.0, hi=70.0):
        """Elevation (deg) at which the actuator is `length_mm` long, by bisection (length falls monotonically from
        lo to hi for the shipped pin and anchor; tests check it). Lengths outside the span clamp to its ends."""
        if length_mm >= self.length(lo):
            return lo
        if length_mm <= self.length(hi):
            return hi
        for _ in range(48):
            mid = (lo + hi) / 2
            if self.length(mid) > length_mm:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2


ELEV_RC = "rc"          # actuator with its own position loop and an RC-servo input (Actuonix L16-R class)
ELEV_POT = "pot"        # actuator with a feedback potentiometer, driven through an H-bridge (L16-P class)
ELEV_TIMED = "timed"    # bare actuator through an H-bridge, homed on its retract limit and timed from there


class LinearAxis:
    """The feeder's elevation actuator as a position axis in stroke mm (0 = fully retracted), 2026-11-11.

    Board-independent like StepperAxis. `target(deg)` converts the head angle to a stroke through `geom`, clamped to
    the poses between `lo_deg` and `hi_deg` and kept `end_mm` off each end of the stroke. `update(dt_ms, feedback_mm)`
    is called every tick and returns what the board applies until the next tick:

    - rc: the stroke fraction 0..1 for the actuator's own servo input (1.0 ms retracted, 2.0 ms extended). Position
      is not read back; `pos` is an estimate that moves toward the goal at the actuator's speed, so `settled` says
      when the head has had time to arrive.
    - pot: a signed H-bridge duty (-1..1, positive extends) from a proportional loop on `feedback_mm` (the pot read
      and scaled by the board; None when the reading is outside the calibrated span, a broken wire). A missing reading
      keeps the last duty and faults after `lost_ticks` in a row (30 ms at the 10 ms tick); it also faults
      when the duty is on but the stroke has moved less than `stall_mm` in `stall_ms` (jammed, or the H-bridge has no
      power).
    - timed: a signed duty, always full speed, with the position integrated from the speeds measured on your build
      (they differ: gravity pulls the nose up, which retracts). Unhomed, it retracts for long enough to cover the
      whole stroke and stops on the actuator's internal limit, which is stroke 0. Every move adds `speed_tol` of its
      length to an error budget; a move that would take the budget past `rehome_mm` homes first when homing and
      then moving out from stroke 0 would leave a smaller error than going direct. A stop
      mid-move adds `coast_mm`; with `self_locking` False any stop (the e-stop contactor cuts power and the head
      sinks nose up) clears the home.

    The head's weight pulls the nose up at every angle (cad/README.md, "Elevation drive"), so the actuator always
    pushes: no backlash flip at any pose.
    """

    def __init__(self, mode, geom, closed_mm, stroke_mm, lo_deg, hi_deg, speed_ext_mm_s, speed_ret_mm_s,
                 end_mm=3.0, retract_end_mm=0.5, stop_clear_deg=46.3, deadband_mm=0.5, kp=0.08, min_duty=0.35, stall_ms=600, stall_mm=0.5,
                 lost_ticks=3, speed_tol=0.05, rehome_mm=3.0, coast_mm=1.0, self_locking=True):
        if mode not in (ELEV_RC, ELEV_POT, ELEV_TIMED):
            raise ValueError("elevation mode must be rc, pot or timed")
        self.mode, self.geom = mode, geom
        self.closed, self.stroke = closed_mm, stroke_mm
        self.v_ext, self.v_ret = speed_ext_mm_s, speed_ret_mm_s
        self.deadband, self.kp, self.min_duty = deadband_mm, kp, min_duty
        self.stall_ms, self.stall_mm = stall_ms, stall_mm
        self.lost_ticks, self._lost = lost_ticks, 0
        self.speed_tol, self.rehome_mm, self.coast_mm = speed_tol, rehome_mm, coast_mm
        self.self_locking = self_locking
        # Stroke limits from the angle limits (the higher angle is the shorter actuator), inside the end margins.
        # (the retract end gets a small margin only: the actuator's own limit there is the designed safe stop)
        self.s_lo = max(retract_end_mm, geom.length(hi_deg) - closed_mm)
        self.s_hi = min(stroke_mm - end_mm, geom.length(lo_deg) - closed_mm)
        if self.s_lo >= self.s_hi:
            raise ValueError("elevation actuator cannot reach the angle range")
        self.homed = mode != ELEV_TIMED
        # Timed homing drives into the retract limit on purpose: refuse if that pulls the head past where its plates
        # clear the turntable (cad `elev_clear_max`; a 240 mm actuator would stop at +48.8 deg, into the plates).
        self.fault = mode == ELEV_TIMED and geom.elev(closed_mm) > stop_clear_deg
        self.pos = self.s_lo if mode == ELEV_RC else 0.0
        self.goal = self.pos
        self.duty = 0.0           # applied since the last update
        self.budget = 0.0         # timed: worst-case position error so far (mm)
        self._home_ms = 0
        self._stall_t = 0
        self._stall_ref = 0.0
        self._fresh = True        # rc: the first update sends the goal, so the estimate starts unknown

    def stroke_for(self, deg):
        return _clamp(self.geom.length(deg) - self.closed, self.s_lo, self.s_hi)

    def deg(self):
        return self.geom.elev(self.pos + self.closed)

    def target(self, deg):
        self.goal = self.stroke_for(deg)

    @property
    def settled(self):
        return (self.homed and not self.fault and self.duty == 0
                and abs(self.goal - self.pos) <= self.deadband + 1e-9)

    def stop(self):
        moving = self.duty != 0
        self.duty = 0.0
        self._stall_t = 0
        if self.mode == ELEV_RC:
            self._fresh = True    # the board stops the pulse, so where it halted is unknown: assume the far end again
        if self.mode != ELEV_TIMED:
            return
        if not self.self_locking:
            self.homed = False
            self._home_ms = 0
        elif moving and self.homed:
            self.budget += self.coast_mm
        elif not self.homed:
            self._home_ms = 0     # an interrupted homing starts over

    def _speed(self, duty):
        return self.v_ext * duty if duty > 0 else self.v_ret * duty

    def update(self, dt_ms, feedback_mm=None):
        dt = dt_ms / 1000.0
        if self.fault or dt <= 0:
            self.duty = 0.0
            return 0.0
        if self.mode == ELEV_RC:
            if self._fresh:
                self._fresh = False
                self.pos = self.s_lo if self.goal >= (self.s_lo + self.s_hi) / 2 else self.s_hi  # assume the far end
            d = self.goal - self.pos
            step = (self.v_ext if d > 0 else self.v_ret) * dt
            self.pos = self.goal if abs(d) <= step else self.pos + (step if d > 0 else -step)
            return self.goal / self.stroke
        if self.mode == ELEV_POT:
            if feedback_mm is None:
                # A wire off reads off every tick; one disturbed tick does not. Hold the last duty (at most 22 mm/s
                # for 20 ms: under 0.5 mm) and fault when it persists. Stopping instead would reset the stall timer
                # each time, and a jammed actuator whose readings drop out every other tick would never fault.
                self._lost += 1
                if self._lost >= self.lost_ticks:
                    self.fault, self.duty = True, 0.0
                    return 0.0
                if self.duty != 0:
                    self._stall_t += dt_ms
                    if self._stall_t > self.stall_ms:
                        self.fault, self.duty = True, 0.0
                        return 0.0
                return self.duty
            self._lost = 0
            self.pos = feedback_mm
            if self.duty != 0:
                self._stall_t += dt_ms
                if abs(self.pos - self._stall_ref) >= self.stall_mm:
                    self._stall_t, self._stall_ref = 0, self.pos
                elif self._stall_t > self.stall_ms:
                    self.fault, self.duty = True, 0.0
                    return 0.0
            err = self.goal - self.pos
            if abs(err) <= self.deadband:
                self.duty = 0.0
                self._stall_t = 0
                return 0.0
            if self.duty == 0:
                self._stall_t, self._stall_ref = 0, self.pos
            mag = min(1.0, max(self.min_duty, abs(err) * self.kp))
            self.duty = mag if err > 0 else -mag
            return self.duty
        # timed: integrate the duty applied over the last tick, then choose the next one
        if not self.homed:
            self.duty = -1.0
            self._home_ms += dt_ms
            if self._home_ms >= (self.stroke / self.v_ret * 1.25 + 0.5) * 1000:
                self.homed, self.pos, self.budget, self.duty = True, 0.0, 0.0, 0.0
                self._home_ms = 0
                return 0.0
            return -1.0
        if self.duty != 0:
            moved = self._speed(self.duty) * dt
            self.pos = _clamp(self.pos + moved, 0.0, self.stroke)
            self.budget += abs(moved) * self.speed_tol
        err = self.goal - self.pos
        if abs(err) <= self.deadband or (self.duty > 0 and err < 0) or (self.duty < 0 and err > 0):
            self.duty = 0.0
            return 0.0
        direct = self.budget + abs(err) * self.speed_tol
        if self.duty == 0 and direct > self.rehome_mm and self.goal * self.speed_tol < direct:
            self.homed, self._home_ms = False, 0       # homing first, then moving out, ends up surer: do that
            return 0.0
        self.duty = 1.0 if err > 0 else -1.0
        return self.duty


class LiftRun:
    """When the ball lift's gearmotor runs (2026-11-13, cad/README.md "Ball lift"), and its jam cutoff (2026-11-15,
    cad/README.md "Lift jam cutoff").

    A returning ball takes up to `run_on_ms` to reach the tub after the last ball is fed: its flight and fall down the
    net, the far end of the trough (about 5 s) and the lift itself (about 9 s at 0.27 m/s), the figure the CAD's
    manifest prints as the lift's run-on. So every ball fed restarts the timer, and the motor runs until it expires; it
    is off from power-up and after every stop (e-stop, watchdog). `update(now_ms, over)` returns the duty to drive.

    `over` is the shunt comparator (GPIO 0 low): the motor draws more than the trip current. A motor starts at its
    stall current, so `over` is ignored for `blank_ms` after each start; after that, `over` on every tick for `trip_ms`
    is a stall (a ball caught at a pulley), and the motor goes off. It rests `rest_ms` (the belt and the ball relax,
    and a ball half in the boot may drop back) and tries again with a full run-on, up to `retries` times; then it stays
    off and `jammed` is set (telemetry FLAG_LIFT_JAM) until `clear()`, which the board calls when the switched bus
    drops: someone pressed the e-stop, which is how a person reaches into the lift. A stop (watchdog, ESTOP frame) does
    not clear it: the Pi reconnecting must not drive the belt into the same jam. A run-on that ends untripped resets
    the retry count.

    Soft start (2026-11-15, cad/README.md "Lift coupling dynamics"): every start, the first and each retry, ramps the
    duty up over `ramp_ms` instead of switching straight to `duty`. The jaw coupling between the gearmotor and the
    drive shaft is a spring with free play: a switched start lets the rotor cross the play at speed and ring the
    coupling's mode, putting up to 2.3 times the soft start's torque on the slip hub, and with a hard, worn spider an
    empty belt's start slips the hub. The ramp sits inside the jam blanking, so the cutoff is unchanged. 0 switches straight to `duty`.

    Speed held over the battery (2026-11-15, cad/README.md "Lift duty follows the battery"): at a fixed duty the belt
    ran 0.91 to 1.23 times its nominal speed between the 24 V cut and the charger's 29.2 V, and that band swept the
    flight rate across the empty belt's lowest string mode (2.12 Hz). With `v_ref_mv` set, the duty is
    `duty` x min(1, v_ref_mv / bus) on the battery reading passed to `update`, smoothed over `bus_tau_ms` (the reading's
    noise and the 260 mV a braking wheel adds must not wobble the belt), never under `duty_min`. A reading outside
    `BUS_VALID_MV` (a loose divider, an ADC fault) is ignored: with no good reading yet the duty is `duty`, as before.
    0 keeps the fixed duty."""

    BUS_VALID_MV = (10000, 40000)

    def __init__(self, run_on_ms, duty=1.0, blank_ms=400, trip_ms=10, rest_ms=2000, retries=1, ramp_ms=0,
                 v_ref_mv=0, duty_min=0.0, bus_tau_ms=500, on_trip=None):
        self.on_trip = on_trip        # called once per cut (a stall the slip hub slid through): JamLog.add
        self.run_on_ms = run_on_ms
        self.duty = duty
        self.ramp_ms = ramp_ms
        self.v_ref_mv, self.duty_min, self.bus_tau_ms = v_ref_mv, duty_min, bus_tau_ms
        self.bus_mv = None            # smoothed battery reading
        self._bus_at = None
        self.blank_ms, self.trip_ms, self.rest_ms, self.retries = blank_ms, trip_ms, rest_ms, retries
        self.until = None
        self.on_since = None          # when the motor was last switched on
        self.over_since = None        # first tick of the current run of over-current ticks
        self.rest_until = None
        self.trips = 0
        self.jammed = False

    def kick(self, now_ms):
        if not self.jammed:
            self.until = max(self.until or 0, now_ms + self.run_on_ms)

    def stop(self):
        self.until = None
        self.on_since = self.over_since = self.rest_until = None

    def clear(self):
        self.stop()
        self.jammed = False
        self.trips = 0

    def _off(self):
        self.on_since = self.over_since = None
        return 0.0

    def _track_bus(self, now_ms, bus_mv):
        lo, hi = self.BUS_VALID_MV
        if bus_mv is None or not lo <= bus_mv <= hi:
            return
        if self.bus_mv is None or self.bus_tau_ms <= 0:
            self.bus_mv = float(bus_mv)
        else:
            dt = max(0, now_ms - self._bus_at)
            self.bus_mv += (bus_mv - self.bus_mv) * min(1.0, dt / self.bus_tau_ms)
        self._bus_at = now_ms

    def run_duty(self):
        """The duty a running belt gets: `duty`, scaled down on a battery over `v_ref_mv`."""
        if not self.v_ref_mv or self.bus_mv is None:
            return self.duty
        return self.duty * max(self.duty_min, min(1.0, self.v_ref_mv / self.bus_mv))

    def update(self, now_ms, over=False, bus_mv=None):
        self._track_bus(now_ms, bus_mv)
        if self.until is None or self.jammed:
            return self._off()
        if self.rest_until is not None:
            if now_ms < self.rest_until:
                return self._off()
            self.rest_until = None
        if now_ms >= self.until:
            self.until = None
            self.trips = 0
            return self._off()
        if self.on_since is None:
            self.on_since = now_ms
        if over and now_ms - self.on_since >= self.blank_ms:
            if self.over_since is None:
                self.over_since = now_ms
            if now_ms - self.over_since >= self.trip_ms:
                self.trips += 1
                self._off()
                if self.on_trip is not None:
                    self.on_trip()
                if self.trips > self.retries:
                    self.jammed = True
                    self.until = None
                else:
                    self.rest_until = now_ms + self.rest_ms
                    self.until = self.rest_until + self.run_on_ms
                return 0.0
        else:
            self.over_since = None
        d = self.run_duty()
        if self.ramp_ms > 0:
            return d * min(1.0, (now_ms - self.on_since + 10) / self.ramp_ms)
        return d


class JamLog:
    """The lift's jam count, kept in flash so it survives power-off (2026-11-16, cad/README.md "Slip hub wear").

    Every cut is a stall the slip hub slid through until the cutoff tripped, and each slide wears its facings (the CAD
    assumes 0.083 um a jam). The disc stack keeps the hub in the jam sweep's band for `lift_slip_jams` (300) jams after a
    bench set, so the hub needs re-setting after that many, a retry's second cut included. A drill session is far
    shorter than 300 jams, so a count in RAM would restart at every power-up and never reach it.

    The file holds {"jams": all cuts ever, "since_set": cuts since the hub was last set}. It is written once per cut
    (rare: a few a session at most, well inside the flash's wear levelling), to `path + ".tmp"` and then renamed over
    `path`, so a power cut mid-write leaves the old count or the new one. A missing file is a new board: 0. A file
    that cannot be read is treated as due (`unreadable`): a lost count must not hide a worn hub. `due` drives
    FLAG_LIFT_HUB_DUE; `reset()` (RESET_LIFT_HUB, after the bench re-set) zeroes `since_set` and keeps `jams`.
    A write that fails (flash full, read-only) sets `write_failed` and keeps counting in RAM. `due_at` 0 never flags."""

    def __init__(self, path, due_at):
        self.path, self.due_at = path, due_at
        self.jams = self.since_set = 0
        self.unreadable = False
        self.write_failed = False
        try:
            f = open(path)
        except OSError:
            return                    # no file yet: a new board, or never jammed
        try:
            with f:
                d = json.loads(f.read())
            jams, since = d["jams"], d["since_set"]
            if not (isinstance(jams, int) and isinstance(since, int) and 0 <= since <= jams):
                raise ValueError("bad counts")
            self.jams, self.since_set = jams, since
        except (ValueError, KeyError, TypeError, OSError):
            self.unreadable = True

    @property
    def due(self):
        return self.unreadable or (self.due_at > 0 and self.since_set >= self.due_at)

    def add(self):
        self.jams += 1
        self.since_set += 1
        self._save()

    def reset(self):
        self.since_set = 0
        self.unreadable = False
        self._save()

    def _save(self):
        tmp = self.path + ".tmp"
        try:
            with open(tmp, "w") as f:
                f.write(json.dumps({"jams": self.jams, "since_set": self.since_set}))
            try:
                os.rename(tmp, self.path)
            except OSError:
                os.remove(self.path)  # a filesystem whose rename will not replace a file: the brief gap is the cost
                os.rename(tmp, self.path)
            self.write_failed = False
        except OSError:
            self.write_failed = True


class AgitatorRun:
    """When the hopper agitator's gearmotor runs (2026-11-13, cad/README.md "Hopper agitator").

    Balls bridge the tub's outlet when they sit still on it, so the arms stir only while a ball is wanted: whenever a
    ball is queued to feed or on its way to the wheels, and for `run_on_ms` after, long enough for the arms to cross
    the outlet twice more and top up the column behind the last ball. Off from power-up and after every stop (e-stop,
    watchdog). `update(now_ms, wanted)` returns the duty to drive."""

    def __init__(self, run_on_ms, duty=1.0):
        self.run_on_ms = run_on_ms
        self.duty = duty
        self.until = None

    def stop(self):
        self.until = None

    def update(self, now_ms, wanted):
        if wanted:
            self.until = now_ms + self.run_on_ms
        if self.until is None:
            return 0.0
        if now_ms >= self.until:
            self.until = None
            return 0.0
        return self.duty


def launch_dips(top_rpm, bottom_rpm, inertia, ball_kg, wheel_r, ball_r, speed_eff, spin_eff):
    """Each launcher wheel's expected speed drop, as a fraction of its own speed, when a ball goes through (2026-11-16).

    Momentum, not energy, so slip and the felt's heat do not enter: the wheels' tangential pushes J_top + J_bottom give
    the ball its linear momentum m v, and their difference times the ball's radius gives it its spin I_b w_b (I_b =
    2/3 m r^2, a thin shell). Exit speed and spin come from the launcher's own model (`launcher.WheelLauncher`: v =
    speed_eff x mean surface speed, w_b = spin_eff x (v_top - v_bottom) / 2r). Wheel i then loses J_i R / I of its
    angular speed. For a flat shot each wheel drops m speed_eff R^2 / (2 I): 8.8% with the CAD's numbers, at any speed.
    The faster wheel always drops at least m speed_eff R^2 / (4 I), 4.4%, whatever the spin. A wheel at rest reads 0."""
    w_t, w_b = top_rpm * math.pi / 30, bottom_rpm * math.pi / 30
    v = speed_eff * (w_t + w_b) * wheel_r / 2
    spin = spin_eff * (w_t - w_b) * wheel_r / (2 * ball_r)
    lin = ball_kg * v
    rot = (2.0 / 3.0) * ball_kg * ball_r * spin       # I_b w_b / r_b
    j_t, j_b = (lin + rot) / 2, (lin - rot) / 2
    return (j_t * wheel_r / inertia / w_t if w_t > 0 else 0.0,
            j_b * wheel_r / inertia / w_b if w_b > 0 else 0.0)


class LaunchCheck:
    """Did the feed stroke put a ball through the wheels? Read from the launcher wheels' own speed (2026-11-16,
    firmware/esp32/README.md "Empty hopper").

    A ball squeezed through the wheels takes its momentum from them, and the tachometers see each wheel slow by the
    fraction `launch_dips` predicts (8.8% on a flat shot). A stroke that carries an empty pocket leaves them steady.
    So no sensor and no pin is needed to see a dry hopper, which matters because the feeder's ESP32 has no GPIO left
    (hardware/electronics.md: every exposed pin but UART0's is taken).

    `start(targets, now)` when the shuttle's forward stroke begins (the wheels are held within 3% of target then, or
    the gate would not have opened); `stroke_done(now)` when it ends; `update(now, rpms)` every control tick returns
    None while it watches, then once, `check_ms` after the stroke's end, True (a ball went: the wheel with the larger
    predicted drop fell by at least `share` of its prediction, and by `dip_min` at least, measured from its own speed just
    before the fall, not from its target) or False (it did not).
    Wheels both at rest give no verdict (None throughout): nothing could launch a ball. `cancel()` on any stop.
    Pass the wheels' current targets to `update`: once they differ from the stroke's (the Pi re-aims as soon as it sees
    the release counted, at the stroke's end), the low readings stop being taken, so the next shot's slower speed or the
    drill's final stop cannot pass for a ball. The ball meets the wheels about 0.14 s before the stroke ends (cad: 0.76
    s of the 0.9 s GATE_OUT_MS), and the Pi's re-aim comes after the end, so the drop it makes is always in the window."""

    def __init__(self, inertia, ball_kg, wheel_r, ball_r, speed_eff, spin_eff, share=0.25, dip_min=0.015, check_ms=250,
                 esc_tau_us=0, survey=ESC_SURVEY_GRID_US, take_us=None, take_grid=TAKE_SURVEY_GRID_US):
        self.model = (inertia, ball_kg, wheel_r, ball_r, speed_eff, spin_eff)
        # The ball's contact time the drop fit models (config TAKE_US; README "A take that lasts a few milliseconds"):
        # 0 or None keeps the module's LOOP_TAKE (the step unless a test sets it), else a half-sine of that time.
        self.take_us = take_us
        # The contact-time survey (README "The contact time surveyed on the board"): `take_on` while the Pi asks for it.
        self.take_survey = ResidualSurvey(take_grid, TAKE_SURVEY_TRIM, TAKE_SURVEY_BLIND) if take_grid else None
        self.take_on = False
        self.esc_tau_us = esc_tau_us  # the ESC's own lag for the drop fit (config ESC_TAU_US; 0: the wheel's lag only)
        self.share, self.dip_min, self.check_ms = share, dip_min, check_ms
        self.targets = None
        self.until = None
        self.low = [0.0, 0.0]
        self.frozen = False
        self.last_dip = None          # the measured drop of the judged wheel at the last verdict, for the README's sweep
        self.last_dip_target = None   # the same wheel's drop below its target (the verdict before 2026-11-16 evening)
        # Every verdict, both wheels (2026-11-16, README "Shot log"): (seq mod 256, top and bottom rpm just before the
        # ball, their drops in 1/10000 of that speed, 1 if a ball went). The ball's momentum is in the drops, so the Pi
        # fits the launcher's efficiencies from them (tennisbots.launcher.fit_from_drops) without a radar gun. The drop
        # is the largest fall of a reading below the highest reading of the 2.5 revolutions before it, so it is taken
        # from the wheel's own speed when the ball arrived, not from the target: the gate opens anywhere within 3% of
        # target, and on the simulator that offset alone moved a target-based drop by up to 30%. The window is in time,
        # not readings: while a slowed wheel's next pulse is late, `PeriodTach.rpm_last` reports a falling open
        # revolution every tick, and a three-reading history lost the pre-ball speed to them at 1,500 rpm.
        self.record = None
        self.seq = 0
        self.hist = [[], []]          # each wheel's (ms, reading) over the last 2.5 revolutions
        self.fall = [(0.0, 0.0), (0.0, 0.0)]   # each wheel's largest (fractional fall, speed before it) so far
        # The pulse-time drop (2026-11-16, README "The drop from the pulse times"): each tach's edge count when this
        # stroke's watch began, and its periods from then up to the freeze or the verdict.
        self.edges0 = None
        self.snap = None
        self.last_fit = (None, None)  # each wheel's drop_from_periods result at the last verdict, for the sweeps
        self.last_low = (None, None)
        self.last_snap = None         # the periods that fit was made from, for tests/drop_snapshot_capture.py
        # The loop-command drop (2026-11-16, README "A recovery shaped by the loop's own commands"): each wheel's control
        # ticks while watching, (edge count, us since that edge, the ESC command the tick set), and the fit of a
        # judged stroke still being worked through, one step a tick, after its record went out with the parabola's.
        self.ticks = [[], []]
        self.last_ticks = None
        self.pending = None
        self.last_loop = (None, None)  # each wheel's drop_from_commands result once it has finished, for the sweeps
        # The ESC-lag survey (README "The ESC lag surveyed on the board"): per lag on `survey`, the summed squared
        # residual rms of every wheel all the lags could fit; `survey_n` wheels so far, `survey_cut` balls whose survey a
        # new stroke cut short (the record's own fit is always finished first; the survey is not).
        self.survey = tuple(survey or ())
        self.survey_sums = [0.0] * len(self.survey)
        self.survey_n = 0
        self.survey_wheels = []       # each surveyed wheel's squared rms per lag (the last SURVEY_KEEP), for the trim
        self.survey_trimmed = 0       # wheels the trim left out of `survey_sums` at the last report
        self._sums_n = -1
        self.survey_cut = 0
        self.survey_queue = []        # surveys waiting behind `surveying` (SURVEY_QUEUE)
        self.surveying = None
        # A launched stroke whose slow wheel is still being watched past its verdict (README "Slow wheels watched past
        # the verdict"): a dict with the wheels still short, their edge counts to reach, the deadline, the tachs, the
        # ticks so far and what the loop fit needs; None otherwise. `extended` counts the wheels that were watched on.
        self.ext = None
        self.extended = 0

    def cancel(self):
        self.targets = None
        self.until = None
        self._extend_end()            # a stop ends a slow wheel's watch: its periods from here on are the coast down

    def start(self, targets, now_ms):
        self._extend_end()            # the last ball's slow wheel has what it has: this stroke's periods are not its
        self.finish()                 # a fit still under way is finished now: its record must not be lost
        # a survey under way only pauses: no survey step runs during a stroke (`_survey_step`), SURVEY_QUEUE
        self.ticks = [[], []]
        self.targets = (targets[0], targets[1])
        self.low = [float(targets[0]), float(targets[1])]
        self.fall = [(0.0, float(targets[0])), (0.0, float(targets[1]))]
        self.hist = [[], []]
        self.until = None
        self.frozen = False
        self.edges0 = None
        self.snap = None

    def stroke_done(self, now_ms):
        if self.targets is not None:
            self.until = now_ms + self.check_ms

    def threshold(self, targets=None):
        """(wheel index, smallest fractional drop that counts as a launch), or None when neither wheel turns."""
        t = self.targets if targets is None else targets
        dips = launch_dips(t[0], t[1], *self.model)
        i = 0 if dips[0] >= dips[1] else 1
        if t[i] <= 0:
            return None
        return i, max(self.dip_min, self.share * dips[i])

    def _snapshot(self, tachs):
        if tachs is not None and self.edges0 is not None and self.snap is None:
            self.snap = [t.recent(t.edges - e0) if t.edges >= e0 else [] for t, e0 in zip(tachs, self.edges0)]

    def update(self, now_ms, rpms, targets=None, tachs=None, cmds=None, since=None):
        """`tachs`, the two wheels' PeriodTach objects (optional), lets the record carry the pulse-time drop; `cmds`
        (the ESC commands this tick set) and `since` (us since each tach's last edge) with them, the loop-command drop."""
        self.step()
        if self.ext is not None:
            self._extend_tick(now_ms, targets, tachs, cmds, since)
        if self.targets is None:
            return None
        if tachs is not None and cmds is not None and since is not None and (self.snap is None or LOOP_THROUGH_CHANGE):
            for i in (0, 1):
                log = self.ticks[i]
                log.append((tachs[i].edges, since[i], cmds[i]))
                if len(log) > TICK_LOG:
                    log.pop(0)
        if tachs is not None and self.edges0 is None:
            self.edges0 = (tachs[0].edges, tachs[1].edges)
        if targets is not None and (targets[0], targets[1]) != self.targets:
            if not self.frozen:
                self._snapshot(tachs)       # the periods after this are the next shot's speed change, not the ball
            self.frozen = True
        if not self.frozen:
            for i in (0, 1):
                h = self.hist[i]
                if self.targets[i] > 0:
                    window = 150000.0 / self.targets[i]          # 2.5 revolutions, ms
                    while h and h[0][0] < now_ms - window:
                        h.pop(0)
                    if h:
                        before = max(r for _, r in h)
                        if before > 0 and 1.0 - rpms[i] / before > self.fall[i][0]:
                            self.fall[i] = (1.0 - rpms[i] / before, before)
                    h.append((now_ms, rpms[i]))
                if rpms[i] < self.low[i]:
                    self.low[i] = rpms[i]
        if self.until is None or now_ms < self.until:
            return None
        th = self.threshold()
        self._snapshot(tachs)
        targets_now = targets
        targets, low, fall, snap, frozen = self.targets, self.low, self.fall, self.snap, self.frozen
        self.cancel()
        if th is None:
            return None
        i, need = th
        # Judged on the drop from the wheel's own speed when the ball met it (2026-11-16, README "Empty hopper", "The
        # verdict from the pre-ball speed"), not from the target: a stroke fed as the 3% gate opens after a speed change
        # starts with the wheel still closing on its target, and against the target that offset read 27 of 486 dry
        # strokes as balls and 2 of 486 balls as dry on the simulator (tests/launch_check_sweep.py, "fed at the gate";
        # none either way from the pre-ball speed). `low` (the target-based drop) is kept as `last_dip_target`.
        self.last_dip = fall[i][0]
        self.last_dip_target = 1.0 - low[i] / targets[i]
        went = self.last_dip >= need
        # The record's drops (README "Shot log"): the pulse-time fit's whole drop where it could be made (bit 1 of the
        # flags byte for the top wheel, bit 2 for the bottom), else the lowest reading's fall as before. Only for a
        # launched stroke: a dry one has no ball moment to fit, and the Pi's fit skips it anyway.
        speeds = [fall[k][1] for k in (0, 1)]
        dips = [fall[k][0] for k in (0, 1)]
        flags = 1 if went else 0
        fits = [None, None]
        if went and snap is not None:
            for k in (0, 1):
                if targets[k] > 0:
                    fits[k] = drop_from_periods(snap[k])
                    if fits[k] is not None:
                        dips[k], speeds[k] = fits[k][0], fits[k][1]
                        flags |= 2 << k
        self.last_fit = (fits[0], fits[1])
        self.last_snap = snap
        self.last_loop = (None, None)
        ticks = self.ticks
        self.last_ticks = ticks
        self.ticks = [[], []]
        self.last_low = (fall[0][0], fall[1][0])   # the lowest reading's falls, for tests/pulse_drop_sweep.py
        drops = [int(round(10000 * dips[k])) for k in (0, 1)]
        self.seq = (self.seq + 1) & 0xFF
        self.record = (self.seq, int(round(speeds[0])), int(round(speeds[1])), min(32767, drops[0]),
                       min(32767, drops[1]), flags)
        if went and snap is not None and self.edges0 is not None and ticks[0] and ticks[1]:
            loop_snap = snap
            if LOOP_THROUGH_CHANGE and tachs is not None and frozen:
                # the loop fit takes the periods up to now, through the speed change the parabola's snapshot stopped at
                loop_snap = [t.recent(t.edges - e0) if t.edges >= e0 else [] for t, e0 in zip(tachs, self.edges0)]
            short = self._short(loop_snap, targets, tachs, targets_now, frozen)
            if short:
                self.ext = {"short": short, "until": now_ms + EXTEND_MS, "tachs": tachs, "ticks": ticks,
                            "fit": (loop_snap, self.edges0, targets, speeds, dips, flags)}
                self.extended += len(short)
            else:
                self.pending = self._loop_fit(loop_snap, ticks, self.edges0, targets, speeds, dips, flags)
            self.record = self.record[:5] + (flags | LOOP_PENDING,)
        return went

    def _short(self, snap, targets, tachs, targets_now, frozen=False):
        """{wheel: edge count to reach} for the turning wheels whose snapshot holds fewer than LOOP_AFTER_REVS
        revolutions after the loop fit's anchor, when they can still be watched on (the targets unchanged, or with
        LOOP_THROUGH_CHANGE changed to another speed, not a stop)."""
        if tachs is None or LOOP_AFTER_REVS <= 0:
            return None
        if not LOOP_THROUGH_CHANGE:
            if frozen or (targets_now is not None and (targets_now[0], targets_now[1]) != targets):
                return None
        elif targets_now is not None and _stopped(targets, targets_now):
            return None
        short = {}
        for k in (0, 1):
            p = snap[k]
            if targets[k] <= 0 or len(p) < 8:
                continue
            a = _anchor(p)
            if len(p) - a < LOOP_AFTER_REVS + 1:
                short[k] = self.edges0[k] + a + LOOP_AFTER_REVS + 1
        return short or None

    def _extend_tick(self, now_ms, targets, tachs, cmds, since):
        """One control tick of a slow wheel's watch past its verdict: log the tick, end the watch when it has its
        revolutions, the targets change or EXTEND_MS has passed."""
        ext = self.ext
        fit_targets = ext["fit"][2]
        if targets is not None and (targets[0], targets[1]) != fit_targets and (
                not LOOP_THROUGH_CHANGE or _stopped(fit_targets, targets)):
            self._extend_end()            # the periods after this are the next shot's speed change (or a coast down)
            return
        if tachs is not None and cmds is not None and since is not None:
            for i in (0, 1):
                log = ext["ticks"][i]
                log.append((tachs[i].edges, since[i], cmds[i]))
                if len(log) > TICK_LOG:
                    log.pop(0)
        t = ext["tachs"]
        if now_ms >= ext["until"] or all(t[k].edges >= need for k, need in ext["short"].items()):
            self._extend_end()

    def _extend_end(self):
        """End a slow wheel's watch: re-take the short wheels' periods and start the loop fit on them."""
        ext = self.ext
        if ext is None:
            return
        self.ext = None
        snap, edges0, targets, speeds, dips, flags = ext["fit"]
        snap = list(snap)
        for k in ext["short"]:
            t = ext["tachs"][k]
            if t.edges >= edges0[k]:
                snap[k] = t.recent(t.edges - edges0[k])
        self.last_snap = snap
        self.last_ticks = ext["ticks"]
        self.pending = self._loop_fit(snap, ext["ticks"], edges0, targets, speeds, dips, flags)

    def _loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags):
        """The loop-command fit of both wheels, one step per `step()`; then the record is re-sent with its drops (same
        seq: the Pi replaces the record it holds when the flags change). Bits 3 / 4 of the flags byte: the top /
        bottom drop came from it (bits 1 / 2 stay set, it is a whole drop too); bits 6 / 7: its standard error is over
        LOOP_SE_MAX of it, so the Pi should not lean on it."""
        seq = self.seq
        speeds, dips = list(speeds), list(dips)
        loops = [None, None]
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            e0 = edges0[k]
            tk = esc_lagged_ticks(snap[k], [(c - e0, us, u) for c, us, u in ticks[k]], self.esc_tau_us)
            for item in drop_from_commands_steps(snap[k], tk, after=LOOP_FIT_AFTER, take=self.take()):
                if item is None:
                    yield None
                else:
                    loops[k] = item[1]
            if loops[k] is not None:
                dips[k], speeds[k] = loops[k][0], loops[k][1]
                flags |= (2 << k) | (8 << k)
                if loops[k][5] > LOOP_SE_MAX:
                    flags |= LOOP_UNSURE << k
        self.last_loop = (loops[0], loops[1])
        if self.record is not None and self.record[0] == seq:      # bit 5 (under way) cleared either way
            drops = [int(round(10000 * dips[k])) for k in (0, 1)]
            self.record = (seq, int(round(speeds[0])), int(round(speeds[1])), min(32767, drops[0]),
                           min(32767, drops[1]), flags)
        if self.survey or (self.take_on and self.take_survey is not None):
            if PACK_SURVEY_TICKS:
                packed = pack_ticks(ticks)
                if self.last_ticks is ticks:
                    self.last_ticks = packed      # so the tuples are freed once the record's fit is done with them
                ticks = packed
            self.queue_survey(self._survey(snap, ticks, edges0, targets))

    def queue_survey(self, survey):
        """Run `survey` now if none is under way, else queue it (SURVEY_QUEUE: the oldest waiting gives way)."""
        if self.surveying is None:
            self.surveying = survey
            return
        self.survey_queue.append(survey)
        if len(self.survey_queue) > SURVEY_QUEUE - 1:
            self.survey_queue.pop(0)
            self.survey_cut += 1

    def take(self):
        """The take offsets the record's drop fit runs with."""
        return take_offsets(self.take_us) if self.take_us else LOOP_TAKE

    def take_ms10(self):
        """The contact time the drop fit models (`take_us`; 0 for the step), in 0.1 ms, for the TAKE_SURVEY frame."""
        return int(round((self.take_us or 0) / 100))

    def _survey(self, snap, ticks, edges0, targets):
        """Each turning wheel refitted at every lag on `survey`, one step a tick; a wheel's squared residuals are added
        once every lag fitted it (as tests/esc_lag_pick.py's pick). Then, while `take_on`, each turning wheel refitted at
        every contact time of the take survey with the board's own ESC lag (`_take_survey`)."""
        if self.survey:
            for item in self._esc_survey(snap, ticks, edges0, targets):
                yield item
        if self.take_on and self.take_survey is not None:
            for item in self._take_survey(snap, ticks, edges0, targets):
                yield item

    def _take_survey(self, snap, ticks, edges0, targets):
        ts = self.take_survey
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            e0 = edges0[k]
            tk = esc_lagged_ticks(snap[k], [(c - e0, us, u) for c, us, u in ticks[k]], self.esc_tau_us)
            got = []
            for c in ts.grid:
                fit = None
                # with the tau refinement the record's fit has: without it (refine=0, as the ESC-lag survey had until
                # 2026-11-18) the fits missed by about 60 times the refined fit's rms and every candidate scored alike, so a 6 ms take
                # picked 0 (README "The contact time surveyed on the board")
                for item in drop_from_commands_steps(snap[k], tk, take=take_offsets(c), levels=TAKE_SURVEY_LEVELS,
                                                     after=TAKE_SURVEY_AFTER):
                    if item is None:
                        yield None
                    else:
                        fit = item[1]
                if fit is None:
                    break
                got.append(fit[4] * fit[4])
            if len(got) == len(ts.grid):
                ts.add(got)

    def take_report(self):
        """The contact-time survey for the TAKE_SURVEY frame: (wheels, least and refined contact time in 0.1 ms, each
        candidate's mean rms in 1e-6 of the pre-ball speed), or None before its first wheel."""
        return self.take_survey.report(100) if self.take_survey is not None else None

    def take_kept(self):
        """The take survey's wheels summed (not left out as take-blind), for the TAKE_SURVEY frame's last byte."""
        return self.take_survey.kept_n if self.take_survey is not None else 0

    def _esc_survey(self, snap, ticks, edges0, targets):
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            e0 = edges0[k]
            raw = [(c - e0, us, u) for c, us, u in ticks[k]]
            got = []
            for g in self.survey:
                fit = None
                for item in drop_from_commands_steps(snap[k], esc_lagged_ticks(snap[k], raw, g),
                                                     after=ESC_SURVEY_AFTER, refine=ESC_SURVEY_REFINE):
                    if item is None:
                        yield None
                    else:
                        fit = item[1]
                if fit is None:
                    break
                got.append(fit[4] * fit[4])
            if len(got) == len(self.survey):
                self.survey_add(got)

    def survey_add(self, got):
        """One wheel's squared residual rms at every lag on `survey`."""
        self.survey_wheels.append(array("f", got))
        if len(self.survey_wheels) > SURVEY_KEEP:
            self.survey_wheels.pop(0)
        self.survey_n += 1

    def _survey_sums(self):
        """`survey_sums` over the kept wheels, less those whose best fit is over SURVEY_TRIM times the median wheel's
        (README "One wheel's misses outvoted the drill"); recomputed only after a new wheel."""
        if self._sums_n == self.survey_n:
            return
        ws = self.survey_wheels
        best = sorted(min(w) for w in ws)
        cap = SURVEY_TRIM * SURVEY_TRIM * best[len(best) // 2] if best else 0.0
        sums = [0.0] * len(self.survey)
        kept = 0
        for w in ws:
            if min(w) <= cap:
                kept += 1
                for i in range(len(sums)):
                    sums[i] += w[i]
        self.survey_sums, self.survey_trimmed, self._sums_n = sums, len(ws) - kept, self.survey_n
        self._kept = kept

    def survey_report(self):
        """(wheels surveyed, the least sum's lag in ms, the refined lag in ms, each lag's mean rms over the wheels the
        trim kept, in 1e-6 of the pre-ball speed) for the ESC_SURVEY frame, or None before the first wheel."""
        if not self.survey or self.survey_n == 0:
            return None
        self._survey_sums()
        pick = survey_spline_pick if ESC_SURVEY_SPLINE else survey_pick
        i, ref = pick(self.survey, self.survey_sums)
        rms = [min(65535, int(round(1e6 * math.sqrt(v / self._kept)))) for v in self.survey_sums]
        return (min(255, self.survey_n), self.survey[i] // 1000, int(round(ref / 1000)), rms)

    def step(self):
        """One step of a loop-command fit under way (each control tick); True while there is more to do."""
        if self.pending is None:
            return self._survey_step()
        try:
            next(self.pending)
            return True
        except StopIteration:
            self.pending = None
            return False

    def _survey_step(self, during=False):
        """One survey step, never while a stroke is under way (its control ticks come first) unless `during`."""
        if self.surveying is None or (self.targets is not None and not during):
            return False
        try:
            next(self.surveying)
            return True
        except StopIteration:
            self.surveying = self.survey_queue.pop(0) if self.survey_queue else None
            return self.surveying is not None

    def finish(self):
        """The record's fit run to the end (the survey stays queued; `finish_survey` runs that too)."""
        while self.pending is not None:
            self.step()

    def finish_survey(self):
        self.finish()
        while self._survey_step(during=True):
            pass


class PowerGate:
    """Holds the azimuth stepper driver off until the contactor has closed (2026-11-14, cad/README.md "Stepper ENABLE
    after the contactor").

    The driver's ENABLE is pulled up (driver off) and wired to an ESP32 output; an optocoupler across the contactor's
    coil pulls a sense input low while the coil is energised. The coil comes on when the 0.5 s on-delay timer closes,
    after the precharge, and its contacts touch one pull-in time later and then bounce. So ENABLE goes low only once
    the coil has been seen on continuously for `settle_ms` (longer than pull-in plus bounce); a powered driver held
    off draws next to nothing, so the bus reaches the pack before the contactor closes on it. When the coil drops
    (any e-stop, including a wireless fob that cuts the coil without the board seeing a switch) ENABLE goes high at
    once and `update` reports the loss once, so the caller can halt and the azimuth can drop its position: an
    unpowered stepper holds nothing, and the head may be pushed by hand.
    """

    def __init__(self, settle_ms=150):
        self.settle_ms = settle_ms
        self.enabled = False
        self.losses = 0
        self._on_since = None

    def update(self, coil_on, now_ms):
        """Returns True on the tick the bus is lost (it was enabled and the coil has dropped)."""
        if not coil_on:
            self._on_since = None
            if self.enabled:
                self.enabled = False
                self.losses += 1
                return True
            return False
        if self._on_since is None:
            self._on_since = now_ms
        if not self.enabled and now_ms - self._on_since >= self.settle_ms:
            self.enabled = True
        return False


class Controller:
    def __init__(self, hw, role, now_ms):
        if role not in (ROLE_FEEDER, ROLE_COLLECTOR):
            raise ValueError("role must be feeder or collector")
        self.hw = hw
        self.role = role
        self.decoder = P.Decoder()
        self.estop = False
        self.watchdog_tripped = False
        self.last_rx = now_ms
        self.last_tx = now_ms
        self.rejected = 0
        self.last_drive = (0, 0)
        hw.stop_all()

    def _allowed(self, cmd):
        if cmd in (P.HEARTBEAT, P.ESTOP, P.CLEAR_ESTOP):
            return True
        return cmd in (FEEDER_CMDS if self.role == ROLE_FEEDER else COLLECTOR_CMDS)

    def _halt(self):
        self.last_drive = (0, 0)
        self.hw.stop_all()

    def handle(self, cmd, values, now_ms):
        if not self._allowed(cmd):
            self.rejected += 1
            return
        self.last_rx = now_ms
        if cmd == P.ESTOP:
            self.estop = True
            self._halt()
            return
        if cmd == P.CLEAR_ESTOP:
            # A software clear never overrides the physical button.
            if not self.hw.estop_pressed():
                self.estop = False
                self.watchdog_tripped = False
            return
        if cmd == P.HEARTBEAT:
            if self.watchdog_tripped and not self.estop:
                self.watchdog_tripped = False
            return
        if self.estop or self.watchdog_tripped:
            self.rejected += 1
            return
        hw = self.hw
        if cmd == P.SET_WHEELS:
            hw.set_launch_rpm(_clamp(values[0], 0, MAX_RPM), _clamp(values[1], 0, MAX_RPM))
        elif cmd == P.SET_AIM:
            hw.set_aim(_clamp(values[0], -1500, 4500), _clamp(values[1], -3000, 3000))
        elif cmd == P.FEED:
            hw.feed(_clamp(values[0], 0, 5))
        elif cmd == P.SET_BASE:
            # Until 2026-11-14 the target passed through unclamped, so a bad command could drive the base
            # off its rail although safety.md says base limits are enforced here (quality audit 2026-11-08).
            hw.set_base(_clamp(values[0], -BASE_HALF_TRAVEL_MM, BASE_HALF_TRAVEL_MM),
                        _clamp(values[1], 0, MAX_BASE_MM_S))
        elif cmd == P.DRIVE:
            left = _clamp(values[0], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            right = _clamp(values[1], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            if hw.bumper() and (left > 0 or right > 0):
                left = right = 0     # bumper pressed: only reversing is allowed
            self.last_drive = (left, right)
            hw.drive(left, right)
        elif cmd == P.PICKUP:
            hw.pickup(bool(values[0]))
        elif cmd == P.SURVEY_TAKE:
            # The contact-time survey on or off (README "The contact time surveyed on the board"): the Pi turns it on
            # for a calibration drill, since each ball's survey then costs about twice the board time.
            on = getattr(hw, "take_survey", None)
            if on is not None:
                on(bool(values[0]))
        elif cmd == P.RESET_LIFT_HUB:
            reset = getattr(hw, "lift_hub_reset", None)
            if values[0] == P.RESET_LIFT_HUB_KEY and reset is not None:
                reset()
            else:
                self.rejected += 1

    def tick(self, rx_bytes, now_ms):
        """Process received bytes and safety checks; returns bytes to transmit (maybe empty)."""
        bus_tick = getattr(self.hw, "bus_tick", None)
        if bus_tick is not None and bus_tick(now_ms):
            self._halt()          # the switched bus went: drop every queued motion, the FEED queue included
        for cmd, values in self.decoder.feed(rx_bytes):
            self.handle(cmd, values, now_ms)
        if self.hw.estop_pressed() and not self.estop:
            self.estop = True
            self._halt()
        if not self.watchdog_tripped and now_ms - self.last_rx > WATCHDOG_MS:
            self.watchdog_tripped = True
            self._halt()
        if (self.role == ROLE_COLLECTOR and self.hw.bumper()
                and (self.last_drive[0] > 0 or self.last_drive[1] > 0)):
            self.last_drive = (0, 0)
            self.hw.drive(0, 0)
        if now_ms - self.last_tx >= TELEMETRY_MS:
            self.last_tx = now_ms
            return self.telemetry()
        return b""

    def telemetry(self):
        flags = self.hw.flags()
        if self.estop:
            flags |= P.FLAG_ESTOP
        if self.watchdog_tripped:
            flags |= P.FLAG_WATCHDOG
        if self.hw.bumper():
            flags |= P.FLAG_BUMPER
        top, bottom = self.hw.rpm()
        fed = self.hw.balls_fed() if self.role == ROLE_FEEDER else 0
        out = P.encode(P.TELEMETRY, flags & 0xFFFF, _clamp(self.hw.base_y_mm(), -32768, 32767),
                       _clamp(top, -32768, 32767), _clamp(bottom, -32768, 32767),
                       _clamp(self.hw.battery_mv(), 0, 65535), (fed or 0) & 0xFF)
        # The last stroke's verdict and both wheels' drops ride along every period (README "Shot log"), so a frame lost
        # on the wire costs nothing: the Pi keys them by seq.
        rec = getattr(self.hw, "launch_record", None)
        rec = rec() if rec is not None and self.role == ROLE_FEEDER else None
        if rec is not None:
            out += P.encode(P.LAUNCH, *rec)
        sv = getattr(self.hw, "esc_survey", None)
        sv = sv() if sv is not None and self.role == ROLE_FEEDER else None
        if sv is not None:
            rms = (list(sv[3]) + [65535] * P.ESC_SURVEY_LAGS)[:P.ESC_SURVEY_LAGS]
            out += P.encode(P.ESC_SURVEY, sv[0], min(65535, sv[1]), min(65535, sv[2]), *rms)
        tv = getattr(self.hw, "take_survey_report", None)
        tv = tv() if tv is not None and self.role == ROLE_FEEDER else None
        if tv is not None:
            rms = (list(tv[4]) + [65535] * P.TAKE_SURVEY_TIMES)[:P.TAKE_SURVEY_TIMES]
            kept = tv[5] if len(tv) > 5 else 255
            out += P.encode(P.TAKE_SURVEY, tv[0], min(65535, tv[1]), min(65535, tv[2]), min(65535, tv[3]), *rms,
                            min(255, kept))
        # The lag the drop fit runs with rides along too (README "Checked before a calibration drill"): the Pi compares
        # it with the last survey before a drill's first ball, since a board told the wrong lag reads spin far off.
        tau = getattr(self.hw, "esc_tau_ms", None)
        tau = tau() if tau is not None and self.role == ROLE_FEEDER else None
        if tau is not None:
            out += P.encode(P.ESC_TAU, _clamp(tau, 0, 65535))
        return out
