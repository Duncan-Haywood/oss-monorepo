"""Pi side of a drill: send each shot to the feeder ESP32 and release a ball only once the head has arrived.

`DrillPlayer` is a state machine driven by `step(now_ms, rx_bytes) -> tx_bytes`, so the same code runs against a
serial port (`run_serial`) and against the simulated board (`run_sim`, the firmware itself on stub pins). For each
shot it:

1. checks the shot fits the axes (elevation -15..45 deg, azimuth -30..30, wheels <= 7,000 rpm): the firmware
   clamps out-of-range commands without saying so, which would fly the ball somewhere else;
2. sends SET_WHEELS and SET_AIM, then waits until *fresh* frames have shown ready for `steady_ms` without a
   break: FLAG_AIM_SETTLING and FLAG_AZ_UNHOMED clear and both wheels within `rpm_tol` of target. Fresh means the board has seen the new aim: a frame that
   shows SETTLING after the send proves it, and otherwise (a shot with the same aim) the second frame after the
   send does, since a frame built before the command can still be in flight;
3. sends FEED 1, then holds the aim until telemetry has stayed ready for `hold_ms` without a break. The board
   releases on its first update where the wheels and aim are ready and the gate has been shut 400 ms, so a
   continuous ready window longer than the gate cycle means the ball has gone; re-aiming earlier would launch
   the ball with the next shot's aim;
4. waits the shot's `gap_s` (optional, per shot) and moves on.

Any of e-stop, watchdog, elevation fault or an empty hopper aborts the drill, as do telemetry silence for
`silence_ms`, or a shot whose aim does not settle in `settle_timeout_ms` (timed-mode homing takes about 9 s).
Heartbeats go out every 100 ms (the board stops after 300 ms of quiet). On the way out the wheels are set to 0.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from . import protocol as P

ELEV_RANGE = (-15.0, 45.0)
AZ_RANGE = (-30.0, 30.0)
MAX_RPM = 7000
HEARTBEAT_MS = 100
STOP_FLAGS = {P.FLAG_ESTOP: "e-stop", P.FLAG_WATCHDOG: "watchdog (heartbeats lost)",
              P.FLAG_ELEV_FAULT: "elevation actuator fault", P.FLAG_HOPPER_EMPTY: "hopper empty"}


@dataclass
class PlannedShot:
    elevation_deg: float
    azimuth_deg: float
    rpm_top: int
    rpm_bottom: int
    gap_s: float = 0.0
    target: tuple | None = None


@dataclass
class ShotLog:
    index: int
    sent_ms: int | None = None
    ready_ms: int | None = None
    fed_ms: int | None = None
    done_ms: int | None = None
    error: str | None = None


def check_shot(s: PlannedShot) -> str | None:
    if not ELEV_RANGE[0] <= s.elevation_deg <= ELEV_RANGE[1]:
        return f"elevation {s.elevation_deg:.1f} deg is outside the head's {ELEV_RANGE[0]:.0f}..{ELEV_RANGE[1]:.0f}"
    if not AZ_RANGE[0] <= s.azimuth_deg <= AZ_RANGE[1]:
        return f"azimuth {s.azimuth_deg:.1f} deg is outside the turntable's {AZ_RANGE[0]:.0f}..{AZ_RANGE[1]:.0f}"
    if not (0 <= s.rpm_top <= MAX_RPM and 0 <= s.rpm_bottom <= MAX_RPM):
        return f"wheel speeds {s.rpm_top}/{s.rpm_bottom} rpm are outside 0..{MAX_RPM}"
    return None


@dataclass
class DrillPlayer:
    shots: list
    rpm_tol: float = 0.02          # stricter than the board's 5%: in simulation 4% let balls land up to 0.5-0.6 m off, 2% 0.2-0.3 m
    steady_ms: int = 300           # ready this long, without a break, before FEED: wheels that are still swinging
                                   # through the band fail it (the tach reads the last turn, so it lags a moving wheel)
    hold_ms: int = 700             # > the board's 400 ms gate rest + 150 ms gate open + a tick and a frame
    settle_timeout_ms: int = 20000
    silence_ms: int = 500
    skip_bad: bool = True          # skip a shot that does not fit the axes; False aborts the drill on it
    state: str = "start"
    log: list = field(default_factory=list)
    abort: str | None = None
    telemetry: tuple | None = None

    def __post_init__(self):
        self.decoder = P.Decoder()
        self.i = -1
        self._last_tx = None
        self._last_rx = None
        self._frames_since_send = 0
        self._fresh = False
        self._t0 = 0
        self._ready_since = None

    # --- helpers ---------------------------------------------------------------------------------------------
    @property
    def done(self):
        return self.state in ("finished", "aborted")

    def _ready(self, s: PlannedShot) -> bool:
        flags, _, top, bottom, _ = self.telemetry
        if flags & (P.FLAG_AIM_SETTLING | P.FLAG_AZ_UNHOMED):
            return False
        for got, want in ((top, s.rpm_top), (bottom, s.rpm_bottom)):
            if want == 0:
                if got > 100:
                    return False
            elif abs(got - want) > self.rpm_tol * want:
                return False
        return True

    def _send(self, out, cmd, *vals, now):
        out.extend(P.encode(cmd, *vals))
        self._last_tx = now

    def _stop(self, out, now, reason=None):
        self._send(out, P.SET_WHEELS, 0, 0, now=now)
        if reason:
            self.abort = reason
            self.state = "aborted"
            if 0 <= self.i < len(self.log) and self.log[self.i].done_ms is None:
                self.log[self.i].error = reason
        else:
            self.state = "finished"

    def _next(self, out, now):
        while True:
            self.i += 1
            if self.i >= len(self.shots):
                self._stop(out, now)
                return
            s = self.shots[self.i]
            entry = ShotLog(self.i)
            self.log.append(entry)
            bad = check_shot(s)
            if bad is None:
                break
            entry.error = bad
            if not self.skip_bad:
                self._stop(out, now, f"shot {self.i}: {bad}")
                return
        self._send(out, P.SET_WHEELS, int(round(s.rpm_top)), int(round(s.rpm_bottom)), now=now)
        self._send(out, P.SET_AIM, int(round(s.elevation_deg * 100)), int(round(s.azimuth_deg * 100)), now=now)
        entry.sent_ms = self._t0 = now
        self._ready_since = None
        self._frames_since_send = 0
        self._fresh = False
        self.state = "aiming"

    # --- the loop --------------------------------------------------------------------------------------------
    def step(self, now_ms: int, rx: bytes = b"") -> bytes:
        out = bytearray()
        for cmd, vals in self.decoder.feed(rx):
            if cmd != P.TELEMETRY:
                continue
            self.telemetry = vals
            self._last_rx = now_ms
            self._frames_since_send += 1
            if vals[0] & P.FLAG_AIM_SETTLING or self._frames_since_send >= 2:
                self._fresh = True
        if self.done:
            return bytes(out)
        if self.state == "start":
            self._last_rx = now_ms
            self._send(out, P.CLEAR_ESTOP, now=now_ms)      # clears a software stop only; the button wins
            self._next(out, now_ms)
            return bytes(out)
        if now_ms - self._last_rx > self.silence_ms:
            self._stop(out, now_ms, f"no telemetry for {now_ms - self._last_rx} ms")
            return bytes(out)
        if self.telemetry is not None:
            for bit, why in STOP_FLAGS.items():
                if self.telemetry[0] & bit:
                    self._stop(out, now_ms, why)
                    return bytes(out)
        s = self.shots[self.i] if 0 <= self.i < len(self.shots) else None
        entry = self.log[self.i] if 0 <= self.i < len(self.log) else None
        if self.state == "aiming":
            if self._fresh and self._ready(s):
                if self._ready_since is None:
                    self._ready_since = now_ms
            else:
                self._ready_since = None
            if self._ready_since is not None and now_ms - self._ready_since >= self.steady_ms:
                entry.ready_ms = now_ms
                self._send(out, P.FEED, 1, now=now_ms)
                entry.fed_ms = now_ms
                self._ready_since = now_ms
                self._frames_since_send = 0
                self.state = "holding"
            elif now_ms - self._t0 > self.settle_timeout_ms:
                self._stop(out, now_ms, f"shot {self.i}: aim or wheels not ready after {self.settle_timeout_ms} ms")
                return bytes(out)
        elif self.state == "holding":
            if self.telemetry is None or not self._ready(s):
                self._ready_since = None
            elif self._ready_since is None:
                self._ready_since = now_ms
            if self._ready_since is not None and now_ms - self._ready_since >= self.hold_ms:
                entry.done_ms = now_ms
                self._t0 = now_ms
                self.state = "gap"
            elif now_ms - entry.fed_ms > self.settle_timeout_ms:
                self._stop(out, now_ms, f"shot {self.i}: not ready long enough to release after "
                                         f"{self.settle_timeout_ms} ms")
                return bytes(out)
        if self.state == "gap" and now_ms - self._t0 >= s.gap_s * 1000:
            self._next(out, now_ms)
        if not out and (self._last_tx is None or now_ms - self._last_tx >= HEARTBEAT_MS):
            self._send(out, P.HEARTBEAT, now=now_ms)
        return bytes(out)


def plan(spec: dict, wheels=None) -> list:
    """PlannedShots from a drill spec (the `tennisbots drill` file format); unreachable shots raise ValueError."""
    from . import launcher
    m = spec.get("machine", {})
    origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
    wheels = wheels or launcher.WheelLauncher(**spec.get("launcher", {}))
    out = []
    for i, s in enumerate(spec["shots"]):
        try:
            shot = launcher.aim(origin, (s["x"], s["y"]), s["speed"], s.get("topspin", 0.0), s.get("sidespin", 0.0))
            rt, rb = wheels.wheel_rpm(shot.speed, shot.topspin_rpm * launcher.bl.RPM)
        except ValueError as exc:
            raise ValueError(f"shot {i}: {exc}") from exc
        out.append(PlannedShot(shot.elevation_deg, shot.azimuth_deg, int(round(rt)), int(round(rb)),
                               float(s.get("gap", 0.0)), (s["x"], s["y"])))
    return out


def run_sim(shots, board=None, max_ms=600000, **player_kw):
    """Play `shots` against a SimBoard (default: pot mode). Returns (player, board)."""
    from .simboard import SimBoard
    board = board or SimBoard()
    p = DrillPlayer(list(shots), **player_kw)
    to_board = b""
    for _ in range(max_ms):
        from_board = board.step(to_board)
        to_board = p.step(board.now_ms, from_board)
        if p.done:
            board.step(to_board)
            break
    return p, board


def run_serial(shots, port, baud=115200, **player_kw):  # pragma: no cover - needs a board
    import serial  # pyserial, `pip install tennisbots[serial]`
    p = DrillPlayer(list(shots), **player_kw)
    with serial.Serial(port, baud, timeout=0) as ser:
        t0 = time.monotonic()
        try:
            while not p.done:
                now = int((time.monotonic() - t0) * 1000)
                tx = p.step(now, ser.read(ser.in_waiting or 0))
                if tx:
                    ser.write(tx)
                time.sleep(0.002)
        except KeyboardInterrupt:
            ser.write(P.encode(P.SET_WHEELS, 0, 0))
            ser.write(P.encode(P.ESTOP))
            p.abort, p.state = "interrupted", "aborted"
    return p
