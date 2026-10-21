"""Board-independent mower firmware: command dispatch, blade interlock, latched stops, watchdog.

Runs on MicroPython (imported by main.py) and on CPython (tests drive it
with a fake hardware object), so it touches hardware only through `hw`.

`hw` must provide:
    drive(left_mm_s, right_mm_s)   wheel speed targets (the speed loop lives in main.py)
    stop_drive()                   wheels to zero now
    blade_set(rpm)                 blade ESC speed target (0 is not a stop: use blade_brake)
    blade_brake()                  cut the blade drive and short-brake the motor
    blade_rpm() -> int             measured (ESC tach or hall)
    stop_button() -> bool          the red button on top of the shell is pressed
    lifted() -> bool               shell lifted off its posts (any hall sensor)
    bumped() -> bool               shell pushed sideways (any hall sensor)
    tilt_cdeg() -> (pitch, roll)   from the IMU, centidegrees
    rain() -> bool
    charging() -> bool             on the dock contacts
    battery_mv() -> int

The stop button also opens the blade power relay in hardware
(hardware/electronics.md), so the blade stops even if this code hangs.
Everything else here is single-channel software: see hardware/safety.md.
"""

import protocol as P

WATCHDOG_MS = 300          # stop everything if the Pi goes quiet for this long
TELEMETRY_MS = 100

MAX_DRIVE_MM_S = 600
MAX_BLADE_RPM = 3200
BLADE_RAMP_RPM_S = 2000    # soft start: 0 -> 2800 rpm in 1.4 s
BLADE_TILT_CDEG = 2000     # blade off beyond 20 degrees of pitch or roll
BLADE_TILT_RESUME_CDEG = 1500
TIP_CDEG = 3500            # beyond 35 degrees: latched stop of every motor
BLADE_STOP_MS = 1500       # the disc must be below BLADE_STOPPED_RPM this long after a stop...
BLADE_STOPPED_RPM = 60     # ...or BLADE_FAULT latches until a power cycle
LOW_BATTERY_MV = 24000     # 7S Li-ion, ~3.43 V/cell: go home
CUTOFF_MV = 21000          # ~3.0 V/cell: stop everything (the BMS is the backstop)


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


class Controller:
    def __init__(self, hw, now_ms):
        self.hw = hw
        self.decoder = P.Decoder()
        self.stop_cause = 0
        self.watchdog_tripped = False
        self.blade_fault = False
        self.last_rx = now_ms
        self.last_tx = now_ms
        self.last_tick = now_ms
        self.rejected = 0
        self.last_drive = (0, 0)
        self.blade_target = 0      # what the Pi asked for, while permitted
        self.blade_cmd = 0.0       # ramped value sent to the ESC
        self.blade_off_at = None   # when the blade was last stopped while spinning
        self.tilt_blocked = False
        hw.stop_drive()
        hw.blade_brake()

    # ---- state ------------------------------------------------------------
    @property
    def latched(self):
        return self.stop_cause != 0

    def blade_blockers(self):
        """Every reason the blade may not run right now (empty list = permitted)."""
        hw = self.hw
        out = []
        if self.latched:
            out.append("stop latched")
        if self.watchdog_tripped:
            out.append("watchdog")
        if self.blade_fault:
            out.append("blade fault")
        if hw.lifted():
            out.append("lifted")
        if hw.bumped():
            out.append("bumped")
        if self.tilt_blocked:
            out.append("tilted")
        if hw.rain():
            out.append("rain")
        if hw.charging():
            out.append("charging")
        if hw.battery_mv() < CUTOFF_MV:
            out.append("battery cutoff")
        return out

    # ---- actions ------------------------------------------------------------
    def _blade_off(self, now_ms):
        if self.blade_target or self.blade_cmd > 0:
            self.blade_off_at = now_ms
        self.blade_target = 0
        self.blade_cmd = 0.0
        self.hw.blade_brake()

    def _halt(self, now_ms):
        self.last_drive = (0, 0)
        self.hw.stop_drive()
        self._blade_off(now_ms)

    def _latch(self, cause, now_ms):
        self.stop_cause |= cause
        self._halt(now_ms)

    def handle(self, cmd, values, now_ms):
        if cmd not in P.FORMATS or cmd == P.TELEMETRY:
            self.rejected += 1
            return
        self.last_rx = now_ms
        if cmd == P.ESTOP:
            self._latch(P.CAUSE_SOFTWARE, now_ms)
            return
        if cmd == P.CLEAR_ESTOP:
            # Never clears while a stop input is still active.
            hw = self.hw
            pitch, roll = hw.tilt_cdeg()
            if not (hw.stop_button() or hw.lifted() or max(abs(pitch), abs(roll)) >= BLADE_TILT_RESUME_CDEG):
                self.stop_cause = 0
                self.watchdog_tripped = False
            return
        if cmd == P.HEARTBEAT:
            if self.watchdog_tripped and not self.latched:
                self.watchdog_tripped = False
            return
        if self.latched or self.watchdog_tripped:
            self.rejected += 1
            return
        hw = self.hw
        if cmd == P.DRIVE:
            if hw.battery_mv() < CUTOFF_MV:
                self.rejected += 1
                return
            left = _clamp(values[0], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            right = _clamp(values[1], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S)
            if hw.bumped() and (left > 0 or right > 0):
                left = right = 0     # shell pushed: only reversing is allowed
            self.last_drive = (left, right)
            hw.drive(left, right)
        elif cmd == P.BLADE:
            rpm = _clamp(values[0], 0, MAX_BLADE_RPM)
            if rpm == 0:
                self._blade_off(now_ms)
            elif self.blade_blockers():
                self.rejected += 1
            else:
                self.blade_target = rpm

    def tick(self, rx_bytes, now_ms):
        """Process received bytes and the safety inputs; returns bytes to transmit (maybe empty)."""
        dt = now_ms - self.last_tick
        self.last_tick = now_ms
        for cmd, values in self.decoder.feed(rx_bytes):
            self.handle(cmd, values, now_ms)
        hw = self.hw
        # Latched stops.
        if hw.stop_button() and not self.stop_cause & P.CAUSE_BUTTON:
            self._latch(P.CAUSE_BUTTON, now_ms)
        if hw.lifted() and not self.stop_cause & P.CAUSE_LIFT:
            self._latch(P.CAUSE_LIFT, now_ms)
        pitch, roll = hw.tilt_cdeg()
        tilt = max(abs(pitch), abs(roll))
        if tilt >= TIP_CDEG and not self.stop_cause & P.CAUSE_TILT:
            self._latch(P.CAUSE_TILT, now_ms)
        if not self.watchdog_tripped and now_ms - self.last_rx > WATCHDOG_MS:
            self.watchdog_tripped = True
            self._halt(now_ms)
        # Tilt hysteresis for the blade.
        if tilt >= BLADE_TILT_CDEG:
            self.tilt_blocked = True
        elif tilt < BLADE_TILT_RESUME_CDEG:
            self.tilt_blocked = False
        if hw.battery_mv() < CUTOFF_MV and (self.last_drive != (0, 0) or self.blade_target):
            self._halt(now_ms)
        if hw.bumped() and (self.last_drive[0] > 0 or self.last_drive[1] > 0):
            self.last_drive = (0, 0)
            hw.stop_drive()
        # Blade: any blocker stops it, and it stays stopped until the Pi asks again.
        if self.blade_blockers():
            if self.blade_target or self.blade_cmd > 0:
                self._blade_off(now_ms)
        elif self.blade_target:
            step = BLADE_RAMP_RPM_S * dt / 1000.0
            self.blade_cmd = min(float(self.blade_target), self.blade_cmd + step)
            hw.blade_set(int(self.blade_cmd))
        # Did the disc actually stop?
        if self.blade_off_at is not None and now_ms - self.blade_off_at > BLADE_STOP_MS:
            if hw.blade_rpm() > BLADE_STOPPED_RPM:
                self.blade_fault = True
            self.blade_off_at = None
        if now_ms - self.last_tx >= TELEMETRY_MS:
            self.last_tx = now_ms
            return self.telemetry()
        return b""

    def flags(self):
        hw = self.hw
        f = 0
        if self.latched:
            f |= P.FLAG_ESTOP
        if self.watchdog_tripped:
            f |= P.FLAG_WATCHDOG
        if hw.bumped():
            f |= P.FLAG_BUMP
        if hw.lifted():
            f |= P.FLAG_LIFT
        if self.tilt_blocked:
            f |= P.FLAG_TILT
        if hw.rain():
            f |= P.FLAG_RAIN
        mv = hw.battery_mv()
        if mv < LOW_BATTERY_MV:
            f |= P.FLAG_LOW_BATTERY
        if mv < CUTOFF_MV:
            f |= P.FLAG_BATTERY_CUTOFF
        if self.blade_cmd > 0:
            f |= P.FLAG_BLADE_ON
        if self.blade_fault:
            f |= P.FLAG_BLADE_FAULT
        if hw.charging():
            f |= P.FLAG_CHARGING
        return f

    def telemetry(self):
        hw = self.hw
        pitch, roll = hw.tilt_cdeg()
        return P.encode(P.TELEMETRY, self.flags() & 0xFFFF, self.stop_cause & 0xFFFF,
                        _clamp(hw.blade_rpm(), -32768, 32767), _clamp(hw.battery_mv(), 0, 65535),
                        _clamp(pitch, -32768, 32767), _clamp(roll, -32768, 32767))
