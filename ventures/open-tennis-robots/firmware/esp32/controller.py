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
