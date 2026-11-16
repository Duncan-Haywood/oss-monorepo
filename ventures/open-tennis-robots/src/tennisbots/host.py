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

Since 2026-11-16 the firmware judges every feed stroke by the launcher wheels' speed drop (a ball takes its momentum
from them; firmware `controller.LaunchCheck`) and sets `FLAG_HOPPER_EMPTY` when a stroke put no ball through. The
runner stops there and reports the shot that went dry and how many flew, instead of carrying on with an empty pocket
(it used to count the stroke as a shot) or ending on a release timeout. After the last shot it waits for that shot's
verdict before reporting the drill done.

Every verdict also comes with a record (the LAUNCH frame, 2026-11-16, firmware/esp32/README.md "Shot log"): each
wheel's speed just before the ball and how far it fell. `DrillResult.launches` collects them, `tennisbots run
--shot-log` appends them to a file, and `launcher.fit_from_drops` reads the launcher's efficiencies from them.

Heartbeats go out every 100 ms throughout (the firmware stops everything after 300 ms of silence). Any fault flag
(e-stop, watchdog, elevation fault), a lost link or a step that overruns its time limit aborts the drill: the runner
sends `ESTOP`, which also drops any ball still queued, and reports why.

Transport and clock are injected: `port` needs `write(bytes)` and a non-blocking `read() -> bytes` (pyserial's
`Serial(..., timeout=0)` with `read(256)` wrapped, see `SerialPort`), `clock()` returns seconds and `sleep(s)`
waits. The tests run it against the real firmware code on a simulated board.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field, replace

from . import ballistics as bl
from . import launcher
from . import protocol as P

HEARTBEAT_S = 0.1
# A telemetry frame can be in flight when a command goes out (frames every 100 ms, plus serial and loop latency),
# so only frames received this long after a command are taken to reflect it.
FRESH_S = 0.25
RPM_TOL = 0.05                 # the firmware's own feed-gate tolerance
MAX_WHEEL_RPM = 7000
# Below this a wheel never settles or its ball goes unseen (2026-11-16, simulated feeder: 5,000 rpm over 200 or 300 rpm
# timed out waiting for the wheels; over 400 the launch check read the ball as no ball; 500 and up ran clean).
MIN_WHEEL_RPM = 500
FAULT_FLAGS = {P.FLAG_ESTOP: "e-stop", P.FLAG_WATCHDOG: "watchdog (heartbeats missed)",
               P.FLAG_ELEV_FAULT: "elevation actuator fault",
               P.FLAG_BUS_OFF: "switched bus off (contactor open: wireless e-stop, its coil wire or the timer)"}
# Reported once and the drill goes on: the hopper still holds balls, only their return has stopped (2026-11-15).
WARN_FLAGS = {P.FLAG_LIFT_JAM: "ball lift jammed and off after its retry: balls stop returning to the hopper; clear the "
                               "jam, then press and release the e-stop",
             P.FLAG_LIFT_HUB_DUE: "lift slip hub due a re-set (LIFT_SLIP_JAMS jams since its last set, or the count in "
                                  "flash was lost): check its slip on the scale and set it again (cad/README.md \"Slip "
                                  "hub wear\"), then run `tennisbots lift-hub-reset`"}


# The firmware's verdict on a stroke lands LAUNCH_CHECK_MS (250 ms) after the stroke's end, which is when the release
# is counted; frames this long after the release carry it.
VERDICT_S = 0.25 + FRESH_S
# The loop-command fit the board makes after a verdict, one step a control tick (about 72 ticks for both wheels), may
# take this long before the record comes again with its drops; past it the parabola's stand.
LOOP_FIT_S = 2.0
HOPPER_EMPTY = ("hopper empty: the feed stroke put no ball through the wheels (the launcher wheels did not slow); "
                "refill the tub, or check the outlet for a bridge of balls and the hose for a stuck one")


class HopperEmpty(Exception):
    pass


@dataclass
class PlannedShot:
    index: int
    elevation_cdeg: int
    azimuth_cdeg: int
    rpm_top: int
    rpm_bottom: int
    landing: tuple
    interval_s: float
    speed: float = 0.0             # the ball's planned exit speed (m/s) and spin: what the re-planner keeps when it
    topspin_rpm: float = 0.0       # changes the wheel speeds (rewheel)
    sidespin_rpm: float = 0.0


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
    dry_shot: int | None = None    # index of the shot whose stroke carried no ball (FLAG_HOPPER_EMPTY), if any
    launches: list = field(default_factory=list)   # one dict per judged stroke of this run (LAUNCH frames), shot index
                                                    # included: the input to launcher.fit_from_drops
    fed: list = field(default_factory=list)        # the PlannedShot each FEED was sent with (re-planned speeds included)
    refits: list = field(default_factory=list)     # Refitter.events, when the run re-planned from its own shots

    @property
    def ok(self) -> bool:
        return self.aborted is None


def plan_drill(spec: dict, wheels: launcher.WheelLauncher | None = None) -> list:
    """Every shot of a drill file as machine settings; raises ValueError naming the first shot that cannot be made.
    `wheels` overrides the drill file's "launcher" block (the re-planner passes a fitted one)."""
    m = spec.get("machine", {})
    origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
    wheels = wheels or launcher.WheelLauncher(**spec.get("launcher", {}))
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
        _check_rpm(i, top, bottom)
        out.append(PlannedShot(i, elev, az, round(top), round(bottom), shot.landing,
                               float(s.get("interval", default_gap)), shot.speed, shot.topspin_rpm,
                               shot.sidespin_rpm))
    return out


def _check_rpm(i, top, bottom):
    if max(top, bottom) > MAX_WHEEL_RPM or min(top, bottom) < MIN_WHEEL_RPM:
        raise ValueError(f"shot {i}: wheels {top:.0f}/{bottom:.0f} rpm are outside {MIN_WHEEL_RPM}..{MAX_WHEEL_RPM} "
                         "rpm (below it the tach cannot hold the wheel's speed or see a ball's drop; less spin, or "
                         "more speed)")


def rewheel(shots: list, wheels: launcher.WheelLauncher, origin=None) -> tuple:
    """The same shots with the wheel speeds a different launcher model needs for each one's planned speed and spin.
    The aim does not move: it depends only on the ball's speed and spin, which the drill fixes.

    A shot the model can make only with a wheel outside MIN_WHEEL_RPM..MAX_WHEEL_RPM (heavy spin on a launcher whose
    spin efficiency turned out low) keeps its speed and gets the most spin both wheels can give, re-aimed at the same
    spot, when `origin` is given; otherwise, or if even its speed is out of reach, it keeps its old wheel speeds.
    Returns (shots, notes), a note per shot that was not re-planned as asked."""
    out, notes = [], []
    for p in shots:
        try:
            top, bottom = wheels.wheel_rpm(p.speed, p.topspin_rpm * bl.RPM)
            _check_rpm(p.index, top, bottom)
            out.append(replace(p, rpm_top=round(top), rpm_bottom=round(bottom)))
            continue
        except ValueError as exc:
            why = str(exc)
        less = _most_spin(p, wheels, origin) if origin is not None else None
        if less is None:
            notes.append(f"shot {p.index}: kept its old wheel speeds ({why.removeprefix(f'shot {p.index}: ')})")
            out.append(p)
        else:
            notes.append(f"shot {p.index}: spin cut from {p.topspin_rpm:.0f} to {less.topspin_rpm:.0f} rpm, the most "
                         f"this launcher gives at {p.speed:.0f} m/s with both wheels in {MIN_WHEEL_RPM}..{MAX_WHEEL_RPM} "
                         "rpm; re-aimed")
            out.append(less)
    return out, notes


def _most_spin(p: PlannedShot, wheels: launcher.WheelLauncher, origin) -> PlannedShot | None:
    per = 1 / (bl.RPM * wheels.wheel_radius)
    total = 2 * p.speed / wheels.speed_efficiency * per            # rpm_top + rpm_bottom
    room = 0.99 * min(total - 2 * MIN_WHEEL_RPM, 2 * MAX_WHEEL_RPM - total)
    if room <= 0:
        return None
    diff = math.copysign(room, p.topspin_rpm)
    spin_rpm = diff / per * wheels.spin_efficiency / (2 * wheels.ball_radius) / bl.RPM
    try:
        shot = launcher.aim(origin, p.landing, p.speed, spin_rpm, p.sidespin_rpm)
    except ValueError:
        return None
    elev, az = round(shot.elevation_deg * 100), round(shot.azimuth_deg * 100)
    if not (-1500 <= elev <= 4500 and -3000 <= az <= 3000):
        return None
    return replace(p, rpm_top=round((total + diff) / 2), rpm_bottom=round((total - diff) / 2), elevation_cdeg=elev,
                   azimuth_cdeg=az, landing=shot.landing, topspin_rpm=spin_rpm)


def landing_with(shot: PlannedShot, wheels: launcher.WheelLauncher, origin) -> tuple:
    """Where `shot`, fed at its planned wheel speeds and aim, lands if the launcher is really `wheels`."""
    speed, spin = wheels.exit(shot.rpm_top, shot.rpm_bottom)
    f = launcher._fly(origin, speed, math.radians(shot.elevation_cdeg / 100), math.radians(shot.azimuth_cdeg / 100),
                      spin, shot.sidespin_rpm * bl.RPM, bl.DEFAULT_BALL)
    b = f.first_bounce
    return None if f.hit_net or b is None else (b.pos[0], b.pos[1])


class Refitter:
    """Re-plan a drill's remaining shots from the launcher efficiencies its own shots show (2026-11-16, firmware/esp32/
    README.md "Re-planning a drill from its own shots").

    `run_drill(..., replan=Refitter(spec, ...))` calls it before each shot with the run's launch records so far. After
    `after` launched shots, and again after each further `after`, it fits `launcher.fit_from_drops` to this run's
    records and, when the fit moves the speed efficiency more than `speed_tol` or the spin efficiency more than
    `spin_tol` (relative, about the fit's own error) from the one being planned with, changes that one and returns the remaining shots' new wheel speeds. Each such event is kept in `events`: the fit, and how
    far each remaining shot would have landed from its target on the old wheel speeds if the fit is right (the landing
    shift).

    A drill's shots are usually all at a few speeds, too few to fit the tach's recovery time (`fit_from_drops`), and
    then slow shots read low; pass `recovery_s` from a calibration drill's fit (`tennisbots run --shot-log` reads it from
    the log). Fits outside `SANE` are refused and logged, never adopted."""

    SANE = {"speed_efficiency": (0.3, 1.0), "spin_efficiency": (0.05, 1.0)}

    def __init__(self, spec: dict, *, after: int = 4, recovery_s: float | None = None,
                 inertia: float = launcher.WHEEL_INERTIA_KGM2, speed_tol: float = 0.02, spin_tol: float = 0.15,
                 log=None):
        if after < 2:
            raise ValueError("refit after at least 2 shots: one shot's drops cannot separate speed from spin")
        m = spec.get("machine", {})
        self.origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
        self.wheels = launcher.WheelLauncher(**spec.get("launcher", {}))
        self.after, self.recovery_s, self.inertia, self.log = after, recovery_s, inertia, log
        self.speed_tol, self.spin_tol = speed_tol, spin_tol
        self.events: list = []
        self._next = after

    def __call__(self, launches: list, remaining: list) -> list | None:
        went = [r for r in launches if r.get("launched")]
        if len(went) < self._next or not remaining:
            return None
        self._next = (len(went) // self.after + 1) * self.after
        try:
            fit = launcher.fit_from_drops(went, inertia=self.inertia, base=self.wheels, recovery_s=self.recovery_s)
        except ValueError as exc:
            return self._skip(len(went), f"no fit: {exc}")
        for name, (lo, hi) in self.SANE.items():
            v = getattr(fit, name)
            if v is not None and not lo <= v <= hi:
                return self._skip(len(went), f"fit refused: {name} {v:.3f} is outside {lo}..{hi} (a wheel inertia far "
                                             "off, or a stuck tach?)")
        # Each efficiency is changed only when the fit moved it further than the fit's own error (README "Shot log":
        # 3.9% speed, 11.7% spin over 18 simulated builds; 1.9% and 6.6% after the pulse-time drops; 0.6% and 7.7%
        # since the ball mass was made one, README "Slow wheels and one ball mass", 2026-11-16): speed_tol went from
        # 5% to 2%, which re-planned builds 2.4-3.5% off from about 1 m off target to 0.11 m or less and left a build
        # already right alone. When the fit's error was 3.9%, a 3% correction from a 4-shot fit was as likely noise.
        se, sp = self.wheels.speed_efficiency, self.wheels.spin_efficiency
        if abs(fit.speed_efficiency / se - 1) > self.speed_tol:
            se = fit.speed_efficiency
        if fit.spin_efficiency is not None and abs(fit.spin_efficiency / sp - 1) > self.spin_tol:
            sp = fit.spin_efficiency
        if (se, sp) == (self.wheels.speed_efficiency, self.wheels.spin_efficiency):
            return self._skip(len(went), f"fit within {self.speed_tol:.0%} (speed) and {self.spin_tol:.0%} (spin) of "
                                         "the plan's launcher, inside its own error: no change", fit=fit)
        new = replace(self.wheels, speed_efficiency=se, spin_efficiency=sp)
        out, problems = rewheel(remaining, new, self.origin)
        if all(o is p for o, p in zip(out, remaining)):
            return self._skip(len(went), f"fit not used: the fitted launcher can make none of the shots left "
                                         f"({problems[0]})", fit=fit)
        shifts = []
        for p in remaining:
            land = landing_with(p, new, self.origin)
            shifts.append(None if land is None else
                          {"shot": p.index, "short_m": round(p.landing[0] - land[0], 2),
                           "off_m": round(math.dist(land, p.landing), 2)})
        ev = {"after_shots": len(went), "used": True, "fit": _fit_dict(fit),
              "was": {"speed_efficiency": self.wheels.speed_efficiency, "spin_efficiency": self.wheels.spin_efficiency},
              "landing_shift": shifts, "kept": problems}
        self.events.append(ev)
        self.wheels = new
        if self.log:
            worst = max((s["off_m"] for s in shifts if s), default=0.0)
            self.log(f"re-planned after {len(went)} shots: speed efficiency {ev['was']['speed_efficiency']:.3f} -> "
                     f"{new.speed_efficiency:.3f}, spin {ev['was']['spin_efficiency']:.3f} -> {new.spin_efficiency:.3f}; "
                     f"the {len(remaining)} shots left would have landed up to {worst:.2f} m off target")
            for why in problems:
                self.log(f"  {why}")
        return out

    def _skip(self, n, why, fit=None):
        self.events.append({"after_shots": n, "used": False, "why": why, "fit": fit and _fit_dict(fit)})
        if self.log:
            self.log(f"after {n} shots: {why}")
        return None


def _fit_dict(fit: launcher.DropFit) -> dict:
    r = lambda v: None if v is None else round(v, 4)
    return {"speed_efficiency": r(fit.speed_efficiency), "spin_efficiency": r(fit.spin_efficiency),
            "recovery_s": r(fit.recovery_s), "rms_drop": r(fit.rms), "shots": fit.shots, "note": fit.note}


class FeederLink:
    """Frames out, telemetry in, heartbeats kept up whenever `poll()` runs."""

    def __init__(self, port, clock):
        self.port, self.clock = port, clock
        self.decoder = P.Decoder()
        self.last: Telemetry | None = None
        self._hb = -1e9
        self.launch_log: list = []    # (clock when first seen, record dict) per new LAUNCH seq
        self._seq = None
        self._flags = None

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
            elif cmd == P.LAUNCH and (vals[0] != self._seq or vals[5] != self._flags):
                # Repeated every period until the next verdict. The same seq with new flags is that verdict's record
                # with the loop-command drops the board finished fitting after it (2026-11-16, firmware/esp32/README.md
                # "A recovery shaped by the loop's own commands"): it replaces the record in place.
                rec = {"seq": vals[0], "rpm_top": vals[1], "rpm_bottom": vals[2],
                       "drop_top": vals[3] / 1e4, "drop_bottom": vals[4] / 1e4,
                       "launched": bool(vals[5] & 1), "fit_top": bool(vals[5] & 2),
                       "fit_bottom": bool(vals[5] & 4), "loop_top": bool(vals[5] & 8),
                       "loop_bottom": bool(vals[5] & 16), "loop_pending": bool(vals[5] & 32)}
                if vals[0] == self._seq and self.launch_log:
                    self.launch_log[-1][1].clear()
                    self.launch_log[-1][1].update(rec)
                else:
                    self.launch_log.append((now, rec))
                self._seq, self._flags = vals[0], vals[5]
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
              release_timeout_s=2.0, link_timeout_s=0.5, tick_s=0.01, log=None, replan=None) -> DrillResult:
    """Run planned shots on the feeder. The first shot gets longer to be ready: the axes home at power-up.

    `replan(launches, remaining) -> list | None` (a `Refitter`), if given, is called before each shot after the first
    with this run's launch records so far and the shots not yet fed; a list it returns replaces them."""
    res = DrillResult()
    clock = link.clock
    fed_at = None                 # FLAG_HOPPER_EMPTY speaks for this run only in frames sent after its first FEED
                                  # (a FEED clears it; an older frame may still carry the last run's verdict)
    fed_shots = []                # shot index of each FEED, in order: the n-th LAUNCH record of the run is its verdict

    def launches():
        fresh = [rec for t, rec in link.launch_log if t >= fed_at + FRESH_S]
        return [dict(rec, shot=fed_shots[k]) for k, rec in enumerate(fresh[:len(fed_shots)])]

    def loop_fits(timeout=LOOP_FIT_S):
        """Wait (without failing) for a loop-command fit the board is still working through to come in: the record of
        the last verdict says so in its flags (firmware/esp32/README.md "A recovery shaped by the loop's own
        commands"). A board that never finishes costs `timeout`, and the record keeps the parabola's drops."""
        start = clock()
        while link.launch_log and link.launch_log[-1][1].get("loop_pending") and clock() - start < timeout:
            link.poll()
            sleep(tick_s)

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
                if fed_at is not None and t.t >= fed_at + FRESH_S and t.flags & P.FLAG_HOPPER_EMPTY:
                    raise HopperEmpty()
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
        shots = list(shots)
        for k in range(len(shots)):
            if replan is not None and fed_at is not None:
                # The last stroke's verdict lands VERDICT_S after its release: wait for it, so the re-planner sees every
                # shot fed so far (half a second of the interval, which the next shot spends waiting anyway).
                wait(lambda t: t.t >= last_release + VERDICT_S, VERDICT_S + 1.0, f"shot {shots[k - 1].index}'s launch check")
                loop_fits()
                new = replan(launches(), shots[k:])
                if new is not None:
                    shots[k:] = new
            shot = shots[k]
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
            fed_shots.append(shot.index)
            res.fed.append(shot)
            if fed_at is None:
                fed_at = clock()
            fed = (fed + 1) & 0xFF
            gone = wait(lambda t: t.balls_fed == fed, release_timeout_s, f"{label} release")
            last_release = gone.t
            res.shots.append(ShotResult(shot.index, ready_s, gone.t, (ready.rpm_top, ready.rpm_bottom)))
            if log:
                log(f"{label}: ready in {ready_s:.2f} s, released at {gone.t:.2f} s")
        link.send(P.SET_WHEELS, 0, 0)
        if last_release is not None:  # the last stroke's verdict (the stop above freezes it, it cannot fake a ball)
            wait(lambda t: t.t >= last_release + VERDICT_S, VERDICT_S + 1.0, "last shot's launch check")
            loop_fits()
    except HopperEmpty:
        # Not a fault: nothing is queued (one FEED at a time) and nothing is wrong with the machine, so the wheels are
        # stopped without latching the e-stop; refill and run the drill again.
        link.send(P.SET_WHEELS, 0, 0)
        dry = res.shots.pop() if res.shots else None
        res.dry_shot = dry.index if dry else None
        res.aborted = (f"shot {dry.index}: " if dry else "") + HOPPER_EMPTY + f" ({len(res.shots)} shot{'' if len(res.shots) == 1 else 's'} flew)"
    except Abort as exc:
        link.send(P.ESTOP)            # halts the wheels and drops any queued ball
        res.aborted = str(exc)
    res.link_errors = link.errors
    if fed_at is not None:
        link.poll()
        res.launches = launches()
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


def append_shot_log(path, res: DrillResult, drill: str = "") -> int:
    """Append this run's launch records to a JSON-lines file (one object per judged stroke); returns how many."""
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(path, "a") as fh:
        for rec in res.launches:
            fh.write(json.dumps(dict(rec, at=stamp, drill=drill)) + "\n")
    return len(res.launches)


def read_shot_log(path) -> list:
    with open(path) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def recovery_from_log(path, inertia: float = launcher.WHEEL_INERTIA_KGM2) -> float | None:
    """The tach's recovery time constant fitted from a shot log, if the log spans speeds enough to fit it (a
    calibration drill's does); None if the file is missing or the fit cannot say. It is a property of the wheel's
    speed loop, not of the felt or the balls, so an older log's figure still holds."""
    try:
        recs = read_shot_log(path)
        return launcher.fit_from_drops(recs, inertia=inertia).recovery_s
    except (OSError, ValueError):
        return None


def run_file(path, device, log=print, *, refit_after: int | None = None, recovery_s: float | None = None,
             inertia: float = launcher.WHEEL_INERTIA_KGM2) -> DrillResult:
    with open(path) as fh:
        spec = json.load(fh)
    shots = plan_drill(spec)
    link = FeederLink(SerialPort(device), time.monotonic)
    refit = Refitter(spec, after=refit_after, recovery_s=recovery_s, inertia=inertia, log=log) if refit_after else None
    res = run_drill(link, shots, time.sleep, log=log, replan=refit)
    res.refits = refit.events if refit else []
    return res
