"""Board-independent firmware logic: commands, safety rules, watchdog, telemetry.

Runs on MicroPython (imported by main.py) and on CPython (tests drive it
with a fake hardware object), so it touches hardware only through `hw`.
The Pi plans; this file decides what is allowed. Every rule here holds
whatever the Pi sends:

* e-stop (button or command) stops everything and stays latched until the
  button is released and CLEAR_ESTOP arrives;
* no heartbeat for 300 ms stops everything until one arrives;
* bumper pressed: no wheel may drive forward;
* front cliff: no wheel may drive forward, and if the robot was moving
  forward it reverses for BACKOFF_MS on its own (stopping early if a rear
  sensor sees a drop); rear cliff: no wheel may reverse;
* wheel drop (robot lifted, or a wheel off an edge), battery below the
  cut-off, or the pack over temperature: everything stops and stays stopped until
  the condition is gone and CLEAR_FAULT arrives. Brushes stop too, because
  a lifted robot puts its brushes within reach of fingers;
* the fan runs only with the bin in place;
* the pump runs only while both wheels are commanded forward, and the
  encoders measure, a mean of at least MIN_MOP_MM_S; and only while the
  tank is not empty, the pad is down and nothing above has stopped the
  robot. A stuck or stopped robot never puddles.

`hw` must provide:
    stop_all()                        cut every motor, pump and fan
    drive(left_mm_s, right_mm_s)
    clean(fan_pct, brush_pct, side_pct)    vacuum and combo
    mop(pump_pct, vibration_pct, pad_down) mop and combo
    estop_pressed() -> bool
    bumper() -> bool
    cliff() -> int                    bit per sensor; FRONT_CLIFFS and REAR_CLIFFS masks below
    wheel_drop() -> bool
    bin_present() -> bool
    tank_empty() -> bool
    speeds() -> (left_mm_s, right_mm_s)   measured by the encoders
    battery_mv() -> int
    temp_dC() -> int                  battery pack temperature, tenths of a degree C
"""

import protocol as P

WATCHDOG_MS = 300
TELEMETRY_MS = 100
BACKOFF_MS = 400
BACKOFF_MM_S = 120
MIN_MOP_MM_S = 50
MAX_DRIVE_MM_S = 350         # set by the cliff sensors' lead over the wheels (tests: stop distance)
LOW_BATTERY_MV = 12800       # 4S Li-ion at 3.2 V per cell under load
LOW_BATTERY_HOLD_MS = 1000   # must stay low this long (ignores sag on a bump)
MAX_TEMP_DC = 600            # 60.0 C

FRONT_CLIFFS = 0x0F          # four sensors across the front
REAR_CLIFFS = 0x30           # two behind the wheels

ROLE_VACUUM = "vacuum"
ROLE_MOP = "mop"
ROLE_COMBO = "combo"
ROLES = (ROLE_VACUUM, ROLE_MOP, ROLE_COMBO)


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


class Controller:
    def __init__(self, hw, role, now_ms):
        if role not in ROLES:
            raise ValueError("role must be vacuum, mop or combo")
        self.hw = hw
        self.role = role
        self.decoder = P.Decoder()
        self.estop = False
        self.watchdog_tripped = False
        self.fault = 0               # latched FLAG_WHEEL_DROP | FLAG_LOW_BATTERY | FLAG_OVER_TEMP bits
        self.last_rx = now_ms
        self.last_tx = now_ms
        self.low_since = None
        self.backoff_until = None
        self.rejected = 0
        self.want_drive = (0, 0)     # what the Pi asked for
        self.last_drive = (0, 0)     # what the wheels were told
        self.want_clean = (0, 0, 0)
        self.want_mop = (0, 0, 0)
        self.last_clean = None
        self.last_mop = None
        hw.stop_all()

    # ------------------------------------------------------------ state
    def halted(self):
        return self.estop or self.watchdog_tripped or self.fault != 0

    def backing_off(self):
        return self.backoff_until is not None

    def _allowed(self, cmd):
        if cmd in (P.HEARTBEAT, P.ESTOP, P.CLEAR_ESTOP, P.CLEAR_FAULT, P.DRIVE):
            return True
        if cmd == P.CLEAN:
            return self.role in (ROLE_VACUUM, ROLE_COMBO)
        if cmd == P.MOP:
            return self.role in (ROLE_MOP, ROLE_COMBO)
        return False

    def _halt(self):
        self.want_drive = self.last_drive = (0, 0)
        self.want_clean = (0, 0, 0)
        self.want_mop = (0, 0, 0)
        self.last_clean = self.last_mop = None
        self.backoff_until = None
        self.hw.stop_all()

    # ------------------------------------------------------------ commands
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
            if not self.hw.estop_pressed():   # software never overrides the button
                self.estop = False
                self.watchdog_tripped = False
            return
        if cmd == P.CLEAR_FAULT:
            self.fault &= self._fault_now(now_ms)   # clears only faults whose cause has gone
            return
        if cmd == P.HEARTBEAT:
            if self.watchdog_tripped and not self.estop:
                self.watchdog_tripped = False
            return
        if self.halted():
            self.rejected += 1
            return
        if cmd == P.DRIVE:
            self.want_drive = (_clamp(values[0], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S),
                               _clamp(values[1], -MAX_DRIVE_MM_S, MAX_DRIVE_MM_S))
        elif cmd == P.CLEAN:
            self.want_clean = (_clamp(values[0], 0, 100), _clamp(values[1], 0, 100), _clamp(values[2], 0, 100))
        elif cmd == P.MOP:
            self.want_mop = (_clamp(values[0], 0, 100), _clamp(values[1], 0, 100), 1 if values[2] else 0)

    # ------------------------------------------------------------ safety
    def _fault_now(self, now_ms):
        """Fault bits whose cause is present right now."""
        hw = self.hw
        f = 0
        if hw.wheel_drop():
            f |= P.FLAG_WHEEL_DROP
        if hw.temp_dC() > MAX_TEMP_DC:
            f |= P.FLAG_OVER_TEMP
        if hw.battery_mv() < LOW_BATTERY_MV:
            if self.low_since is None:
                self.low_since = now_ms
            if now_ms - self.low_since >= LOW_BATTERY_HOLD_MS:
                f |= P.FLAG_LOW_BATTERY
        else:
            self.low_since = None
        return f

    def _safe_drive(self, left, right):
        hw = self.hw
        c = hw.cliff()
        if hw.bumper() or c & FRONT_CLIFFS:
            left, right = min(left, 0), min(right, 0)
        if c & REAR_CLIFFS:
            left, right = max(left, 0), max(right, 0)
        return left, right

    def tick(self, rx_bytes, now_ms):
        """Process received bytes and safety checks; returns bytes to transmit (maybe empty)."""
        for cmd, values in self.decoder.feed(rx_bytes):
            self.handle(cmd, values, now_ms)
        hw = self.hw
        if hw.estop_pressed() and not self.estop:
            self.estop = True
            self._halt()
        if not self.watchdog_tripped and now_ms - self.last_rx > WATCHDOG_MS:
            self.watchdog_tripped = True
            self._halt()
        new_fault = self._fault_now(now_ms) & ~self.fault
        if new_fault:
            self.fault |= new_fault
            self._halt()
        if not self.halted():
            self._motion(now_ms)
            self._tools()
        if now_ms - self.last_tx >= TELEMETRY_MS:
            self.last_tx = now_ms
            return self.telemetry()
        return b""

    def _motion(self, now_ms):
        hw = self.hw
        c = hw.cliff()
        if self.backoff_until is not None:
            if now_ms >= self.backoff_until or c & REAR_CLIFFS:
                self.backoff_until = None
                self.want_drive = (0, 0)
                self._set_drive(0, 0)
            return
        if c & FRONT_CLIFFS and (self.last_drive[0] > 0 or self.last_drive[1] > 0):
            self.backoff_until = now_ms + BACKOFF_MS
            self.want_drive = (0, 0)
            if c & REAR_CLIFFS:
                self.backoff_until = None
                self._set_drive(0, 0)
            else:
                self._set_drive(-BACKOFF_MM_S, -BACKOFF_MM_S)
            return
        self._set_drive(*self._safe_drive(*self.want_drive))

    def _set_drive(self, left, right):
        if (left, right) != self.last_drive:
            self.last_drive = (left, right)
            self.hw.drive(left, right)

    def pump_allowed(self):
        l, r = self.last_drive
        ml, mr = self.hw.speeds()   # commanded AND measured: stalled wheels also stop the pump
        return (not self.halted() and self.backoff_until is None and l > 0 and r > 0
                and (l + r) / 2 >= MIN_MOP_MM_S and (ml + mr) / 2 >= MIN_MOP_MM_S
                and not self.hw.tank_empty() and self.want_mop[2] == 1)

    def _tools(self):
        hw = self.hw
        if self.role in (ROLE_VACUUM, ROLE_COMBO):
            fan, brush, side = self.want_clean
            if not hw.bin_present():
                fan = 0
            clean = (fan, brush, side)
            if clean != self.last_clean:
                self.last_clean = clean
                hw.clean(*clean)
        if self.role in (ROLE_MOP, ROLE_COMBO):
            pump, vib, down = self.want_mop
            mop = (pump if self.pump_allowed() else 0, vib if down else 0, down)
            if mop != self.last_mop:
                self.last_mop = mop
                hw.mop(*mop)

    # ------------------------------------------------------------ telemetry
    def telemetry(self):
        hw = self.hw
        flags = self.fault
        if self.estop:
            flags |= P.FLAG_ESTOP
        if self.watchdog_tripped:
            flags |= P.FLAG_WATCHDOG
        if hw.bumper():
            flags |= P.FLAG_BUMPER
        if hw.cliff():
            flags |= P.FLAG_CLIFF
        if self.role != ROLE_MOP and not hw.bin_present():
            flags |= P.FLAG_BIN_MISSING
        if self.role != ROLE_VACUUM and hw.tank_empty():
            flags |= P.FLAG_TANK_EMPTY
        if self.backoff_until is not None:
            flags |= P.FLAG_BACKING_OFF
        if self.last_mop and self.last_mop[0] > 0:
            flags |= P.FLAG_PUMP_ON
        left, right = hw.speeds()
        return P.encode(P.TELEMETRY, flags & 0xFFFF, _clamp(left, -32768, 32767), _clamp(right, -32768, 32767),
                        _clamp(hw.battery_mv(), 0, 65535), _clamp(hw.temp_dC(), -32768, 32767))
