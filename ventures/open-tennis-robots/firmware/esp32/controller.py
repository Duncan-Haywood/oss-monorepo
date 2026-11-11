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
"""

import math

import protocol as P

WATCHDOG_MS = 300        # stop if the Pi goes quiet for this long
TELEMETRY_MS = 100

ROLE_FEEDER = "feeder"
ROLE_COLLECTOR = "collector"

FEEDER_CMDS = (P.SET_WHEELS, P.SET_AIM, P.FEED, P.SET_BASE)
COLLECTOR_CMDS = (P.DRIVE, P.PICKUP)

MAX_RPM = 7000
MAX_DRIVE_MM_S = 1200
MAX_BASE_MM_S = 3000


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


class StepperAxis:
    """Open-loop step/dir axis with trapezoidal moves and a home switch (the feeder's azimuth stepper, 2026-11-10).

    Board-independent: `update(dt_ms, home_closed)` returns the signed number of step pulses to send now, and the
    board layer pulses them. Positions are in degrees at the output (the turntable); `steps_per_deg` folds in the
    motor's steps, microstepping and the gear ratio. Until the home switch has been found the axis is unhomed: it
    creeps toward negative angles at `home_deg_s`, and targets are remembered but not driven. A stop from above
    `safe_stop_deg_s` may lose steps, so it clears the home and the axis homes again. Homing that travels further
    than the whole range plus 10 deg without finding the switch faults and stops (a broken switch must not drive the
    head into its end stop forever).
    """

    def __init__(self, steps_per_deg, vmax_deg_s, accel_deg_s2, home_deg, lo_deg, hi_deg,
                 home_deg_s=5.0, safe_stop_deg_s=10.0):
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
            self._searched = 0.0
        self.v = 0.0
        if self.homed:
            self.goal = self.pos

    def _emit(self):
        n = round(self.pos * self.k) - self._sent
        self._sent += n
        return n

    def update(self, dt_ms, home_closed):
        dt = dt_ms / 1000.0
        if self.fault or dt <= 0:
            return 0
        if not self.homed:
            if home_closed:
                self.homed, self.pos, self.v = True, self.home_deg, 0.0
                self._sent = round(self.pos * self.k)
                return 0
            self._searched += self.home_v * dt
            if self._searched > (self.hi - self.lo) + 10.0:
                self.fault, self.v = True, 0.0
                return 0
            self.v = -self.home_v
            self.pos -= self.home_v * dt
            return self._emit()
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
      and scaled by the board; None when the reading is outside the calibrated span, a broken wire). It faults on a
      missing reading, or when the duty is on but the stroke has moved less than `stall_mm` in `stall_ms` (jammed,
      or the H-bridge has no power).
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
                 speed_tol=0.05, rehome_mm=3.0, coast_mm=1.0, self_locking=True):
        if mode not in (ELEV_RC, ELEV_POT, ELEV_TIMED):
            raise ValueError("elevation mode must be rc, pot or timed")
        self.mode, self.geom = mode, geom
        self.closed, self.stroke = closed_mm, stroke_mm
        self.v_ext, self.v_ret = speed_ext_mm_s, speed_ret_mm_s
        self.deadband, self.kp, self.min_duty = deadband_mm, kp, min_duty
        self.stall_ms, self.stall_mm = stall_ms, stall_mm
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
                self.fault, self.duty = True, 0.0
                return 0.0
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
            hw.set_base(values[0], _clamp(values[1], 0, MAX_BASE_MM_S))
        elif cmd == P.DRIVE:
            left = _clamp(values[0], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            right = _clamp(values[1], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            if hw.bumper() and (left > 0 or right > 0):
                left = right = 0     # bumper pressed: only reversing is allowed
            self.last_drive = (left, right)
            hw.drive(left, right)
        elif cmd == P.PICKUP:
            hw.pickup(bool(values[0]))

    def tick(self, rx_bytes, now_ms):
        """Process received bytes and safety checks; returns bytes to transmit (maybe empty)."""
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
        return P.encode(P.TELEMETRY, flags & 0xFFFF, _clamp(self.hw.base_y_mm(), -32768, 32767),
                        _clamp(top, -32768, 32767), _clamp(bottom, -32768, 32767),
                        _clamp(self.hw.battery_mv(), 0, 65535))
