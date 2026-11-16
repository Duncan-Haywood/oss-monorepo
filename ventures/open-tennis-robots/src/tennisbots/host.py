"""Pi side of the feeder link: run a drill on the ball machine over the serial protocol (2026-11-11).

Until now the repository had both ends' parts but nothing that drove a drill: the planner (`launcher.aim`) said
what each shot needs and the ESP32 firmware obeyed single commands. This module is the loop between them:

1. plan every shot first (`plan_drill`), so a bad drill fails before a wheel turns;
2. per shot, send the wheel speeds and the aim;
3. wait until a telemetry frame that is certainly newer than the command shows the aim settled
   (`FLAG_AIM_SETTLING` clear, azimuth homed) and the wheels held at speed (`FLAG_WHEELS_SETTLING` clear);
4. send `FEED 1` and wait until the firmware's released-ball counter moves, so the next re-aim can never carry a
   queued ball to the wrong place;
5. re-aim for the next shot straight away, but feed no sooner than the drill's interval after the last release.

Heartbeats go out every 100 ms throughout (the firmware stops everything after 300 ms of silence). Any fault flag
(e-stop, watchdog, elevation fault), a lost link or a step that overruns its time limit aborts the drill: the runner
sends `ESTOP`, which also drops any ball still queued, and reports why.

Transport and clock are injected: `port` needs `write(bytes)` and a non-blocking `read() -> bytes` (pyserial's
`Serial(..., timeout=0)` with `read(256)` wrapped, see `SerialPort`), `clock()` returns seconds and `sleep(s)`
waits. The tests run it against the real firmware code on a simulated board.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

from . import ballistics as bl
from . import launcher
from . import protocol as P

HEARTBEAT_S = 0.1
# A telemetry frame can be in flight when a command goes out (frames every 100 ms, plus serial and loop latency),
# so only frames received this long after a command are taken to reflect it.
FRESH_S = 0.25
RPM_TOL = 0.05                 # the firmware's own feed-gate tolerance
FAULT_FLAGS = {P.FLAG_ESTOP: "e-stop", P.FLAG_WATCHDOG: "watchdog (heartbeats missed)",
               P.FLAG_ELEV_FAULT: "elevation actuator fault",
               P.FLAG_BUS_OFF: "switched bus off (contactor open: wireless e-stop, its coil wire or the timer)"}
# Reported once and the drill goes on: the hopper still holds balls, only their return has stopped (2026-11-15).
WARN_FLAGS = {P.FLAG_LIFT_JAM: "ball lift jammed and off after its retry: balls stop returning to the hopper; clear the "
                               "jam, then press and release the e-stop",
             P.FLAG_LIFT_HUB_DUE: "lift slip hub due a re-set (LIFT_SLIP_JAMS jams since its last set, or the count in "
                                  "flash was lost): check its slip on the scale and set it again (cad/README.md \"Slip "
                                  "hub wear\"), then run `tennisbots lift-hub-reset`"}


@dataclass
class PlannedShot:
    index: int
    elevation_cdeg: int
    azimuth_cdeg: int
    rpm_top: int
    rpm_bottom: int
    landing: tuple
    interval_s: float


@dataclass
class Telemetry:
    t: float
    flags: int
    base_y_mm: int
    rpm_top: int
    rpm_bottom: int
    battery_mv: int
    balls_fed: int


@dataclass
class ShotResult:
    index: int
    ready_s: float             # command to aim settled and wheels at speed
    released_at: float         # clock time the firmware reported the ball gone
    rpm: tuple                 # wheel speeds in the last frame before the feed


@dataclass
class DrillResult:
    shots: list = field(default_factory=list)
    aborted: str | None = None
    link_errors: int = 0
    warnings: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.aborted is None


def plan_drill(spec: dict) -> list:
    """Every shot of a drill file as machine settings; raises ValueError naming the first shot that cannot be made."""
    m = spec.get("machine", {})
    origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
    wheels = launcher.WheelLauncher(**spec.get("launcher", {}))
    default_gap = float(spec.get("interval", 3.0))
    out = []
    for i, s in enumerate(spec["shots"]):
        try:
            shot = launcher.aim(origin, (s["x"], s["y"]), s["speed"], s.get("topspin", 0.0), s.get("sidespin", 0.0))
            top, bottom = wheels.wheel_rpm(shot.speed, shot.topspin_rpm * bl.RPM)
        except ValueError as exc:
            raise ValueError(f"shot {i}: {exc}") from None
        elev, az = round(shot.elevation_deg * 100), round(shot.azimuth_deg * 100)
        if not (-1500 <= elev <= 4500 and -3000 <= az <= 3000):
            raise ValueError(f"shot {i}: aim {elev / 100:.1f} deg up, {az / 100:.1f} deg across is outside the "
                             "head's range (-15..45 up, -30..30 across)")
        if max(top, bottom) > 7000 or min(top, bottom) < 0:
            raise ValueError(f"shot {i}: wheels {top:.0f}/{bottom:.0f} rpm are outside 0..7000 rpm")
        out.append(PlannedShot(i, elev, az, round(top), round(bottom), shot.landing,
                               float(s.get("interval", default_gap))))
    return out


class FeederLink:
    """Frames out, telemetry in, heartbeats kept up whenever `poll()` runs."""

    def __init__(self, port, clock):
        self.port, self.clock = port, clock
        self.decoder = P.Decoder()
        self.last: Telemetry | None = None
        self._hb = -1e9

    def send(self, cmd, *values):
        self.port.write(P.encode(cmd, *values))

    def poll(self) -> Telemetry | None:
        now = self.clock()
        if now - self._hb >= HEARTBEAT_S:
            self._hb = now
            self.send(P.HEARTBEAT)
        for cmd, vals in self.decoder.feed(self.port.read() or b""):
            if cmd == P.TELEMETRY:
                self.last = Telemetry(now, *vals)
        return self.last

    @property
    def errors(self) -> int:
        return self.decoder.errors


class Abort(Exception):
    pass


def _wheels_ok(t: Telemetry, shot: PlannedShot) -> bool:
    """The firmware's own verdict (wheels held within 3% for 150 ms) and, as a check that the frame belongs to this
    shot's speeds rather than the last one's, the reported rpm within 5% of this shot's."""
    return not t.flags & P.FLAG_WHEELS_SETTLING and all(
        want and abs(r - want) < RPM_TOL * want for r, want in ((t.rpm_top, shot.rpm_top), (t.rpm_bottom, shot.rpm_bottom)))


def _faults(t: Telemetry, ignore=0) -> str | None:
    bad = [name for bit, name in FAULT_FLAGS.items() if t.flags & bit & ~ignore]
    return ", ".join(bad) or None


def run_drill(link: FeederLink, shots: list, sleep, *, first_timeout_s=30.0, ready_timeout_s=10.0,
              release_timeout_s=2.0, link_timeout_s=0.5, tick_s=0.01, log=None) -> DrillResult:
    """Run planned shots on the feeder. The first shot gets longer to be ready: the axes home at power-up."""
    res = DrillResult()
    clock = link.clock

    def wait(until, timeout, what, ignore=0):
        start = clock()
        while True:
            t = link.poll()
            now = clock()
            if t is not None:
                for bit, text in WARN_FLAGS.items():
                    if t.flags & bit and text not in res.warnings:
                        res.warnings.append(text)
                        if log:
                            log(f"warning: {text}")
                bad = _faults(t, ignore)
                if bad:
                    raise Abort(f"{what}: firmware reports {bad}")
                if now - t.t > link_timeout_s:
                    raise Abort(f"{what}: no telemetry for {now - t.t:.2f} s (cable, baud rate or board reset?)")
                if until(t):
                    return t
            elif now - start > link_timeout_s:
                raise Abort(f"{what}: no telemetry at all (wrong port, baud rate or role?)")
            if now - start > timeout:
                raise Abort(f"{what}: not done in {timeout:.1f} s")
            sleep(tick_s)

    try:
        # The watchdog has usually tripped before the Pi starts talking; the first heartbeats clear it.
        start = clock()
        # The switched bus comes up 0.5 s after the e-stop's release plus the firmware's settle time: wait for it too.
        t0 = wait(lambda t: t.t >= start + FRESH_S and not t.flags & (P.FLAG_WATCHDOG | P.FLAG_BUS_OFF), 2.0, "connect",
                  ignore=P.FLAG_WATCHDOG | P.FLAG_BUS_OFF)
        fed = t0.balls_fed
        last_release = None
        for k, shot in enumerate(shots):
            link.send(P.SET_WHEELS, shot.rpm_top, shot.rpm_bottom)
            link.send(P.SET_AIM, shot.elevation_cdeg, shot.azimuth_cdeg)
            sent = clock()
            label = f"shot {shot.index}"
            ready = wait(lambda t: (t.t >= sent + FRESH_S and not t.flags & (P.FLAG_AIM_SETTLING | P.FLAG_AZ_UNHOMED)
                                    and _wheels_ok(t, shot)),
                         first_timeout_s if k == 0 else ready_timeout_s, f"{label} aim and wheels")
            ready_s = clock() - sent
            if last_release is not None:
                due = last_release + shot.interval_s
                ready = wait(lambda t: clock() >= due and _wheels_ok(t, shot), shot.interval_s + ready_timeout_s,
                             f"{label} interval")
            link.send(P.FEED, 1)
            fed = (fed + 1) & 0xFF
            gone = wait(lambda t: t.balls_fed == fed, release_timeout_s, f"{label} release")
            last_release = gone.t
            res.shots.append(ShotResult(shot.index, ready_s, gone.t, (ready.rpm_top, ready.rpm_bottom)))
            if log:
                log(f"{label}: ready in {ready_s:.2f} s, released at {gone.t:.2f} s")
        link.send(P.SET_WHEELS, 0, 0)
    except Abort as exc:
        link.send(P.ESTOP)            # halts the wheels and drops any queued ball
        res.aborted = str(exc)
    res.link_errors = link.errors
    return res


class SerialPort:
    """pyserial wrapped as the non-blocking port `FeederLink` wants (`pip install tennisbots[serial]`)."""

    def __init__(self, device, baud=115200):
        import serial  # optional dependency
        self.s = serial.Serial(device, baud, timeout=0)

    def write(self, data):
        self.s.write(data)

    def read(self):
        return self.s.read(256)


def reset_lift_hub(link: FeederLink, sleep, *, timeout_s=2.0, tick_s=0.01) -> str | None:
    """Tell the feeder the lift's slip hub was re-set on the bench, so its jam count in flash starts again
    (RESET_LIFT_HUB, 2026-11-16). Returns None once a fresh telemetry frame shows FLAG_LIFT_HUB_DUE clear, else why not."""
    clock = link.clock
    start = clock()
    t = None
    while clock() - start < timeout_s:              # heartbeats first: the watchdog drops commands until they arrive
        t = link.poll()
        if t is not None and t.t >= start + FRESH_S and not t.flags & P.FLAG_WATCHDOG:
            break
        sleep(tick_s)
    else:
        return "no telemetry from the feeder (wrong port, baud rate or role?)"
    if t.flags & (P.FLAG_ESTOP | P.FLAG_BUS_OFF):
        return "the e-stop is pressed or the bus is off: release it, then try again"
    link.send(P.RESET_LIFT_HUB, P.RESET_LIFT_HUB_KEY)
    sent = clock()
    while clock() - sent < timeout_s:
        t = link.poll()
        if t is not None and t.t >= sent + FRESH_S:
            if not t.flags & P.FLAG_LIFT_HUB_DUE:
                return None
        sleep(tick_s)
    return "the feeder still reports the hub due (firmware older than 2026-11-16, or its flash will not take a write)"


def reset_lift_hub_port(device) -> str | None:
    return reset_lift_hub(FeederLink(SerialPort(device), time.monotonic), time.sleep)


def run_file(path, device, log=print) -> DrillResult:
    with open(path) as fh:
        shots = plan_drill(json.load(fh))
    link = FeederLink(SerialPort(device), time.monotonic)
    return run_drill(link, shots, time.sleep, log=log)
