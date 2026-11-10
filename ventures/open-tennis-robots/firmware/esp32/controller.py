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
